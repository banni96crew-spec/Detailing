create function private.reschedule_booking(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text,
  p_operation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource record;
  v_existing private.idempotency_operations%rowtype;
  v_ends_at timestamptz;
  v_buffer_ends_at timestamptz;
  v_result jsonb;
  v_moved boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_operation || ':' || p_idempotency_key::text, 0));
  select * into v_existing from private.idempotency_operations
  where tenant_id = p_tenant_id and operation = p_operation and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = '22023', message = 'Ключ повтора уже использован с другими данными';
    end if;
    return v_existing.result;
  end if;

  select * into strict v_booking from public.bookings
  where tenant_id = p_tenant_id and id = p_booking_id for update;
  if v_booking.status in ('cancelled', 'completed', 'no_show') then
    raise exception using errcode = '22023', message = 'Эту запись уже нельзя перенести';
  end if;
  if not private.slot_is_valid(p_tenant_id, v_booking.service_id, p_starts_at) then
    raise exception using errcode = '22023', message = 'Новое время не входит в доступное окно записи';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_booking.duration_minutes_snapshot);
  v_buffer_ends_at := v_ends_at + make_interval(mins => v_booking.buffer_minutes_snapshot);

  for v_resource in
    select r.id
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id and r.tenant_id = sr.tenant_id
    where sr.tenant_id = p_tenant_id and sr.service_id = v_booking.service_id and r.active
      and not exists (
        select 1 from public.schedule_exceptions se
        where se.tenant_id = p_tenant_id and (se.resource_id is null or se.resource_id = r.id)
          and se.unavailable_range && tstzrange(p_starts_at, v_buffer_ends_at, '[)')
      )
    order by (r.id = v_booking.resource_id) desc, r.resource_key
  loop
    begin
      update public.resource_occupancies
      set resource_id = v_resource.id,
          occupied_range = tstzrange(p_starts_at, v_buffer_ends_at, '[)')
      where tenant_id = p_tenant_id and booking_id = p_booking_id and released_at is null;
      if not found then
        raise exception using errcode = 'P0001', message = 'Активная занятость записи не найдена';
      end if;

      update public.bookings
      set resource_id = v_resource.id,
          starts_at = p_starts_at,
          ends_at = v_ends_at,
          buffer_ends_at = v_buffer_ends_at
      where tenant_id = p_tenant_id and id = p_booking_id
      returning * into v_booking;
      v_moved := true;
      exit;
    exception when exclusion_violation then
      null;
    end;
  end loop;

  if not v_moved then
    raise exception using errcode = '23P01', message = 'Новое время уже занято';
  end if;

  update public.notification_jobs set state = 'suppressed'
  where booking_id = p_booking_id and event_type = 'booking_reminder' and state in ('pending', 'leased');
  perform private.enqueue_booking_job(p_tenant_id, p_booking_id, 'booking_rescheduled', now(), p_idempotency_key::text);
  perform private.enqueue_booking_job(p_tenant_id, p_booking_id, 'booking_reminder', greatest(now(), v_booking.starts_at - interval '24 hours'), p_idempotency_key::text);

  v_result := jsonb_build_object(
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'startsAt', v_booking.starts_at,
    'endsAt', v_booking.ends_at,
    'resourceId', v_booking.resource_id
  );
  insert into private.idempotency_operations (tenant_id, operation, idempotency_key, request_hash, result)
  values (p_tenant_id, p_operation, p_idempotency_key, p_request_hash, v_result);
  return v_result;
end;
$$;

revoke all on function private.reschedule_booking(uuid, uuid, timestamptz, uuid, text, text) from public, anon, authenticated;

create function public.server_reschedule_booking_by_token(
  p_slug text,
  p_access_token_hash text,
  p_starts_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select b.* into strict v_booking
  from public.bookings b join public.tenants t on t.id = b.tenant_id
  where t.slug = p_slug and b.access_token_hash = p_access_token_hash;
  return private.reschedule_booking(v_booking.tenant_id, v_booking.id, p_starts_at, p_idempotency_key, p_request_hash, 'client_reschedule');
end;
$$;

create function public.owner_bookings(p_slug text, p_from_local_date date, p_to_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
begin
  select * into strict v_tenant from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant.id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'bookingId', b.id,
      'status', b.status,
      'startsAt', b.starts_at,
      'endsAt', b.ends_at,
      'priceCents', b.price_cents_snapshot,
      'customerName', b.customer_name,
      'customerPhone', b.customer_phone_e164,
      'vehicle', b.vehicle,
      'notes', b.notes,
      'serviceName', s.name,
      'resourceName', r.name,
      'paidCents', coalesce((select sum(case when p.kind = 'payment' then p.amount_cents else -p.amount_cents end) from public.payments p where p.booking_id = b.id), 0)
    ) order by b.starts_at)
    from public.bookings b
    join public.services s on s.id = b.service_id and s.tenant_id = b.tenant_id
    join public.resources r on r.id = b.resource_id and r.tenant_id = b.tenant_id
    where b.tenant_id = v_tenant.id
      and b.starts_at >= p_from_local_date at time zone v_tenant.timezone
      and b.starts_at < (p_to_local_date + 1) at time zone v_tenant.timezone
  ), '[]'::jsonb);
end;
$$;

create function public.owner_dashboard_stats(p_slug text, p_from_local_date date, p_to_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_from timestamptz;
  v_until timestamptz;
begin
  select * into strict v_tenant from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant.id);
  v_from := p_from_local_date at time zone v_tenant.timezone;
  v_until := (p_to_local_date + 1) at time zone v_tenant.timezone;
  return jsonb_build_object(
    'timezone', v_tenant.timezone,
    'from', p_from_local_date,
    'to', p_to_local_date,
    'arrivals', (select count(*) from public.bookings b where b.tenant_id = v_tenant.id and b.starts_at >= v_from and b.starts_at < v_until and b.status <> 'cancelled'),
    'completedOrders', (select count(*) from public.bookings b where b.tenant_id = v_tenant.id and b.completed_at >= v_from and b.completed_at < v_until),
    'receivedCents', coalesce((select sum(case when p.kind = 'payment' then p.amount_cents else -p.amount_cents end) from public.payments p where p.tenant_id = v_tenant.id and p.received_at >= v_from and p.received_at < v_until), 0)
  );
end;
$$;

create function public.owner_reschedule_booking(
  p_slug text,
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  return private.reschedule_booking(v_tenant_id, p_booking_id, p_starts_at, p_idempotency_key, p_request_hash, 'owner_reschedule');
end;
$$;

create function public.owner_create_booking(
  p_slug text,
  p_service_key text,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone_e164 text,
  p_vehicle text,
  p_notes text,
  p_access_token_hash text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  v_result := public.server_create_booking(
    p_slug, p_service_key, p_starts_at, p_customer_name, p_customer_phone_e164,
    p_vehicle, p_notes, p_access_token_hash, p_idempotency_key, p_request_hash
  );
  update public.bookings set source = 'owner'
  where tenant_id = v_tenant_id and id = (v_result ->> 'bookingId')::uuid;
  return v_result;
end;
$$;

create function public.owner_set_booking_status(
  p_slug text,
  p_booking_id uuid,
  p_status public.booking_status,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_booking public.bookings%rowtype;
  v_existing private.idempotency_operations%rowtype;
  v_result jsonb;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':owner_status:' || p_idempotency_key::text, 0));
  select * into v_existing from private.idempotency_operations
  where tenant_id = v_tenant_id and operation = 'owner_status' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = '22023', message = 'Ключ повтора уже использован с другими данными';
    end if;
    return v_existing.result;
  end if;
  if p_status not in ('accepted', 'ready', 'completed', 'cancelled', 'no_show') then
    raise exception using errcode = '22023', message = 'Недопустимый статус';
  end if;
  update public.bookings set
    status = p_status,
    accepted_at = case when p_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
  where tenant_id = v_tenant_id and id = p_booking_id
  returning * into strict v_booking;
  if p_status in ('cancelled', 'no_show') then
    update public.resource_occupancies set released_at = now() where booking_id = p_booking_id and released_at is null;
    update public.notification_jobs set state = 'suppressed' where booking_id = p_booking_id and state in ('pending', 'leased');
  end if;
  perform private.enqueue_booking_job(v_tenant_id, p_booking_id, 'booking_' || p_status::text, now(), extract(epoch from now())::bigint::text);
  v_result := jsonb_build_object('bookingId', v_booking.id, 'status', v_booking.status);
  insert into private.idempotency_operations (tenant_id, operation, idempotency_key, request_hash, result)
  values (v_tenant_id, 'owner_status', p_idempotency_key, p_request_hash, v_result);
  return v_result;
end;
$$;

create function public.owner_block_resource(
  p_slug text,
  p_resource_key text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_label text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_resource_id uuid;
  v_block public.resource_blocks%rowtype;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  if p_starts_at >= p_ends_at then
    raise exception using errcode = '22023', message = 'Конец блокировки должен быть позже начала';
  end if;
  select id into strict v_resource_id from public.resources where tenant_id = v_tenant_id and resource_key = p_resource_key and active;
  select * into v_block from public.resource_blocks where tenant_id = v_tenant_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('blockId', v_block.id, 'startsAt', lower(v_block.blocked_range), 'endsAt', upper(v_block.blocked_range));
  end if;
  insert into public.resource_blocks (tenant_id, resource_id, blocked_range, label, idempotency_key, created_by)
  values (v_tenant_id, v_resource_id, tstzrange(p_starts_at, p_ends_at, '[)'), trim(p_label), p_idempotency_key, auth.uid())
  returning * into v_block;
  insert into public.resource_occupancies (tenant_id, resource_id, block_id, kind, occupied_range)
  values (v_tenant_id, v_resource_id, v_block.id, 'block', v_block.blocked_range);
  return jsonb_build_object('blockId', v_block.id, 'startsAt', lower(v_block.blocked_range), 'endsAt', upper(v_block.blocked_range));
end;
$$;

create function public.owner_release_block(p_slug text, p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  update public.resource_blocks set released_at = coalesce(released_at, now()) where tenant_id = v_tenant_id and id = p_block_id;
  if not found then raise exception using errcode = 'P0002', message = 'Блокировка не найдена'; end if;
  update public.resource_occupancies set released_at = coalesce(released_at, now()) where tenant_id = v_tenant_id and block_id = p_block_id;
end;
$$;

create function public.owner_record_payment(
  p_slug text,
  p_booking_id uuid,
  p_kind public.payment_kind,
  p_amount_cents integer,
  p_received_at timestamptz,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_payment public.payments%rowtype;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  select * into v_payment from public.payments where tenant_id = v_tenant_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('paymentId', v_payment.id, 'kind', v_payment.kind, 'amountCents', v_payment.amount_cents);
  end if;
  insert into public.payments (tenant_id, booking_id, kind, amount_cents, received_at, note, idempotency_key, created_by)
  values (v_tenant_id, p_booking_id, p_kind, p_amount_cents, p_received_at, nullif(trim(p_note), ''), p_idempotency_key, auth.uid())
  returning * into v_payment;
  return jsonb_build_object('paymentId', v_payment.id, 'kind', v_payment.kind, 'amountCents', v_payment.amount_cents);
end;
$$;

create function public.owner_update_profile(
  p_slug text,
  p_name text,
  p_short_name text,
  p_description text,
  p_phone text,
  p_address text,
  p_directions_url text,
  p_accent_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id, array['owner'::public.member_role]);
  update public.tenants set
    name = trim(p_name), short_name = trim(p_short_name), description = trim(p_description),
    phone = trim(p_phone), address = trim(p_address), directions_url = trim(p_directions_url),
    accent_color = p_accent_color
  where id = v_tenant_id;
end;
$$;

create function public.owner_set_asset(p_slug text, p_asset_key text, p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  if p_asset_key not in ('logo', 'hero') then
    raise exception using errcode = '22023', message = 'Можно заменить только logo или hero';
  end if;
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id, array['owner'::public.member_role]);
  insert into public.tenant_assets (tenant_id, asset_key, storage_path, source)
  values (v_tenant_id, p_asset_key, p_storage_path, 'owner')
  on conflict (tenant_id, source, asset_key) do update set storage_path = excluded.storage_path, updated_at = now();
  update public.tenants
  set runtime_config = jsonb_set(runtime_config, array['assets', p_asset_key], to_jsonb(p_storage_path), true)
  where id = v_tenant_id;
end;
$$;

revoke all on function public.server_reschedule_booking_by_token(text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.server_reschedule_booking_by_token(text, text, timestamptz, uuid, text) to service_role;

revoke all on function public.owner_bookings(text, date, date) from public, anon;
revoke all on function public.owner_dashboard_stats(text, date, date) from public, anon;
revoke all on function public.owner_reschedule_booking(text, uuid, timestamptz, uuid, text) from public, anon;
revoke all on function public.owner_create_booking(text, text, timestamptz, text, text, text, text, text, uuid, text) from public, anon;
revoke all on function public.owner_set_booking_status(text, uuid, public.booking_status, uuid, text) from public, anon;
revoke all on function public.owner_block_resource(text, text, timestamptz, timestamptz, text, uuid) from public, anon;
revoke all on function public.owner_release_block(text, uuid) from public, anon;
revoke all on function public.owner_record_payment(text, uuid, public.payment_kind, integer, timestamptz, text, uuid) from public, anon;
revoke all on function public.owner_update_profile(text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.owner_set_asset(text, text, text) from public, anon;

grant execute on function public.owner_bookings(text, date, date) to authenticated;
grant execute on function public.owner_dashboard_stats(text, date, date) to authenticated;
grant execute on function public.owner_reschedule_booking(text, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.owner_create_booking(text, text, timestamptz, text, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.owner_set_booking_status(text, uuid, public.booking_status, uuid, text) to authenticated;
grant execute on function public.owner_block_resource(text, text, timestamptz, timestamptz, text, uuid) to authenticated;
grant execute on function public.owner_release_block(text, uuid) to authenticated;
grant execute on function public.owner_record_payment(text, uuid, public.payment_kind, integer, timestamptz, text, uuid) to authenticated;
grant execute on function public.owner_update_profile(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.owner_set_asset(text, text, text) to authenticated;
