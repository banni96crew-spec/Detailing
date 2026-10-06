create function private.require_tenant_member(p_tenant_id uuid, p_roles public.member_role[] default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_tenant_member(p_tenant_id, p_roles)) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для этой студии';
  end if;
end;
$$;

create function private.enqueue_booking_job(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_event_type text,
  p_available_at timestamptz,
  p_revision text default '1'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_jobs (
    tenant_id, booking_id, event_type, channel, dedupe_key, payload, available_at
  )
  select
    b.tenant_id,
    b.id,
    p_event_type,
    'push',
    concat(b.id, ':', p_event_type, ':', p_revision),
    jsonb_build_object('bookingId', b.id, 'eventType', p_event_type),
    p_available_at
  from public.bookings b
  join public.tenants t on t.id = b.tenant_id
  where b.id = p_booking_id
    and b.tenant_id = p_tenant_id
    and t.status = 'live'
    and not b.is_demo
  on conflict (tenant_id, dedupe_key) do nothing;
$$;

create function private.slot_is_valid(
  p_tenant_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      ((p_starts_at at time zone t.timezone)::date <= (now() at time zone t.timezone)::date + t.booking_horizon_days)
      and p_starts_at >= now() + make_interval(mins => t.minimum_lead_minutes)
      and wh.closed = false
      and (p_starts_at at time zone t.timezone)::time >= wh.opens_at
      and (p_starts_at at time zone t.timezone)::time <= wh.last_arrival_at
      and mod(
        extract(epoch from ((p_starts_at at time zone t.timezone)::time - wh.opens_at))::integer / 60,
        t.slot_interval_minutes
      ) = 0
    from public.tenants t
    join public.services s on s.tenant_id = t.id and s.id = p_service_id and s.active
    join public.working_hours wh
      on wh.tenant_id = t.id
     and wh.weekday = extract(dow from (p_starts_at at time zone t.timezone))::smallint
    where t.id = p_tenant_id
      and t.status in ('preview', 'live')
  ), false);
$$;

revoke all on function private.require_tenant_member(uuid, public.member_role[]) from public, anon, authenticated;
revoke all on function private.enqueue_booking_job(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function private.slot_is_valid(uuid, uuid, timestamptz) from public, anon, authenticated;

create function public.public_tenant_bootstrap(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'slug', t.slug::text,
    'status', t.status::text,
    'timezone', t.timezone,
    'brand', jsonb_build_object(
      'name', t.name,
      'shortName', t.short_name,
      'description', t.description,
      'accent', t.accent_color,
      'logo', coalesce(t.runtime_config #>> '{brand,logo}', 'images/logo.webp'),
      'hero', coalesce(t.runtime_config #>> '{brand,hero}', 'images/hero.webp')
    ),
    'contact', jsonb_build_object(
      'phone', t.phone,
      'address', t.address,
      'directionsUrl', t.directions_url
    ),
    'booking', jsonb_build_object(
      'slotIntervalMinutes', t.slot_interval_minutes,
      'minimumLeadMinutes', t.minimum_lead_minutes,
      'horizonDays', t.booking_horizon_days,
      'cancellationHours', t.cancellation_hours
    ),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', wh.weekday,
        'closed', wh.closed,
        'opensAt', case when wh.opens_at is null then null else to_char(wh.opens_at, 'HH24:MI') end,
        'lastArrivalAt', case when wh.last_arrival_at is null then null else to_char(wh.last_arrival_at, 'HH24:MI') end
      ) order by wh.weekday)
      from public.working_hours wh where wh.tenant_id = t.id
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('key', r.resource_key, 'name', r.name, 'kind', r.kind) order by r.resource_key)
      from public.resources r where r.tenant_id = t.id and r.active
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', s.service_key,
        'name', s.name,
        'description', s.description,
        'priceCents', s.current_price_cents,
        'durationMinutes', s.duration_minutes,
        'bufferMinutes', s.buffer_minutes,
        'featured', s.featured,
        'resourceKeys', coalesce((
          select jsonb_agg(r.resource_key order by r.resource_key)
          from public.service_resources sr
          join public.resources r on r.id = sr.resource_id and r.tenant_id = sr.tenant_id
          where sr.tenant_id = s.tenant_id and sr.service_id = s.id and r.active
        ), '[]'::jsonb)
      ) order by s.name)
      from public.services s where s.tenant_id = t.id and s.active
    ), '[]'::jsonb),
    'infoCards', coalesce((
      select jsonb_agg(jsonb_build_object('key', c.card_key, 'title', c.title, 'text', c.body) order by c.position)
      from public.information_cards c where c.tenant_id = t.id and c.active
    ), '[]'::jsonb),
    'gallery', coalesce((
      select jsonb_agg(jsonb_build_object('key', g.gallery_key, 'image', g.storage_path, 'caption', g.caption) order by g.position)
      from public.gallery_items g where g.tenant_id = t.id and g.active
    ), '[]'::jsonb),
    'pwa', coalesce(t.runtime_config -> 'pwa', jsonb_build_object(
      'name', t.name || ' — запись',
      'shortName', t.short_name,
      'description', t.description
    )),
    'assets', coalesce(t.runtime_config -> 'assets', '{}'::jsonb)
  )
  from public.tenants t
  where t.slug = p_slug
    and t.status in ('preview', 'live');
$$;

create function public.public_available_slots(p_slug text, p_service_key text, p_local_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with context as (
    select t.id as tenant_id, t.timezone, t.slot_interval_minutes, t.booking_horizon_days,
           t.minimum_lead_minutes, s.id as service_id, s.duration_minutes, s.buffer_minutes,
           wh.closed, wh.opens_at, wh.last_arrival_at
    from public.tenants t
    join public.services s on s.tenant_id = t.id and s.service_key = p_service_key and s.active
    join public.working_hours wh on wh.tenant_id = t.id and wh.weekday = extract(dow from p_local_date)::smallint
    where t.slug = p_slug and t.status in ('preview', 'live')
  ), slots as (
    select c.*,
      gs as starts_at,
      gs + make_interval(mins => c.duration_minutes) as ends_at,
      gs + make_interval(mins => c.duration_minutes + c.buffer_minutes) as buffer_ends_at
    from context c
    cross join lateral generate_series(
      (p_local_date + c.opens_at) at time zone c.timezone,
      (p_local_date + c.last_arrival_at) at time zone c.timezone,
      make_interval(mins => c.slot_interval_minutes)
    ) gs
    where not c.closed
      and p_local_date between (now() at time zone c.timezone)::date
                           and (now() at time zone c.timezone)::date + c.booking_horizon_days
  ), evaluated as (
    select sl.*,
      exists (
        select 1
        from public.service_resources sr
        join public.resources r on r.id = sr.resource_id and r.tenant_id = sr.tenant_id and r.active
        where sr.tenant_id = sl.tenant_id and sr.service_id = sl.service_id
          and not exists (
            select 1 from public.resource_occupancies ro
            where ro.tenant_id = sl.tenant_id and ro.resource_id = r.id and ro.released_at is null
              and ro.occupied_range && tstzrange(sl.starts_at, sl.buffer_ends_at, '[)')
          )
          and not exists (
            select 1 from public.schedule_exceptions se
            where se.tenant_id = sl.tenant_id and (se.resource_id is null or se.resource_id = r.id)
              and se.unavailable_range && tstzrange(sl.starts_at, sl.buffer_ends_at, '[)')
          )
      ) and sl.starts_at >= now() + make_interval(mins => sl.minimum_lead_minutes) as available
    from slots sl
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'startsAt', starts_at,
    'endsAt', ends_at,
    'available', available
  ) order by starts_at), '[]'::jsonb)
  from evaluated;
$$;

create function public.server_create_booking(
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
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_resource record;
  v_booking public.bookings%rowtype;
  v_ends_at timestamptz;
  v_buffer_ends_at timestamptz;
  v_existing private.idempotency_operations%rowtype;
  v_result jsonb;
begin
  select * into strict v_tenant from public.tenants where slug = p_slug and status in ('preview', 'live');
  perform pg_advisory_xact_lock(hashtextextended(v_tenant.id::text || ':create:' || p_idempotency_key::text, 0));

  select * into v_existing
  from private.idempotency_operations
  where tenant_id = v_tenant.id and operation = 'create_booking' and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = '22023', message = 'Ключ повтора уже использован с другими данными';
    end if;
    return v_existing.result;
  end if;

  select * into strict v_service
  from public.services
  where tenant_id = v_tenant.id and service_key = p_service_key and active;

  if not private.slot_is_valid(v_tenant.id, v_service.id, p_starts_at) then
    raise exception using errcode = '22023', message = 'Время не входит в доступное окно записи';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);
  v_buffer_ends_at := v_ends_at + make_interval(mins => v_service.buffer_minutes);

  for v_resource in
    select r.id
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id and r.tenant_id = sr.tenant_id
    where sr.tenant_id = v_tenant.id and sr.service_id = v_service.id and r.active
      and not exists (
        select 1 from public.schedule_exceptions se
        where se.tenant_id = v_tenant.id and (se.resource_id is null or se.resource_id = r.id)
          and se.unavailable_range && tstzrange(p_starts_at, v_buffer_ends_at, '[)')
      )
    order by r.resource_key
  loop
    begin
      insert into public.bookings (
        tenant_id, service_id, resource_id, starts_at, ends_at, buffer_ends_at,
        price_cents_snapshot, duration_minutes_snapshot, buffer_minutes_snapshot,
        customer_name, customer_phone_e164, vehicle, notes, access_token_hash,
        idempotency_key, request_hash, source, is_demo
      ) values (
        v_tenant.id, v_service.id, v_resource.id, p_starts_at, v_ends_at, v_buffer_ends_at,
        v_service.current_price_cents, v_service.duration_minutes, v_service.buffer_minutes,
        trim(p_customer_name), p_customer_phone_e164, trim(p_vehicle), nullif(trim(p_notes), ''),
        p_access_token_hash, p_idempotency_key, p_request_hash, 'client', v_tenant.status = 'preview'
      ) returning * into v_booking;

      insert into public.resource_occupancies (
        tenant_id, resource_id, booking_id, kind, occupied_range
      ) values (
        v_tenant.id, v_resource.id, v_booking.id, 'booking', tstzrange(p_starts_at, v_buffer_ends_at, '[)')
      );
      exit;
    exception when exclusion_violation then
      v_booking := null;
    end;
  end loop;

  if v_booking.id is null then
    raise exception using errcode = '23P01', message = 'Выбранное время уже занято';
  end if;

  v_result := jsonb_build_object(
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'startsAt', v_booking.starts_at,
    'endsAt', v_booking.ends_at,
    'priceCents', v_booking.price_cents_snapshot
  );

  insert into private.idempotency_operations (tenant_id, operation, idempotency_key, request_hash, result)
  values (v_tenant.id, 'create_booking', p_idempotency_key, p_request_hash, v_result);

  perform private.enqueue_booking_job(v_tenant.id, v_booking.id, 'booking_created', now(), '1');
  perform private.enqueue_booking_job(v_tenant.id, v_booking.id, 'booking_reminder', greatest(now(), v_booking.starts_at - interval '24 hours'), '1');
  return v_result;
end;
$$;

create function public.server_booking_by_token(p_slug text, p_access_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bookingId', b.id,
    'status', b.status,
    'startsAt', b.starts_at,
    'endsAt', b.ends_at,
    'bufferEndsAt', b.buffer_ends_at,
    'priceCents', b.price_cents_snapshot,
    'customerName', b.customer_name,
    'customerPhone', b.customer_phone_e164,
    'vehicle', b.vehicle,
    'notes', b.notes,
    'service', jsonb_build_object('key', s.service_key, 'name', s.name),
    'resource', jsonb_build_object('key', r.resource_key, 'name', r.name),
    'tenant', jsonb_build_object('slug', t.slug::text, 'name', t.name, 'timezone', t.timezone, 'cancellationHours', t.cancellation_hours)
  )
  from public.bookings b
  join public.tenants t on t.id = b.tenant_id and t.slug = p_slug
  join public.services s on s.id = b.service_id and s.tenant_id = b.tenant_id
  join public.resources r on r.id = b.resource_id and r.tenant_id = b.tenant_id
  where b.access_token_hash = p_access_token_hash;
$$;

create function public.server_cancel_booking(
  p_slug text,
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
  v_booking public.bookings%rowtype;
  v_tenant public.tenants%rowtype;
  v_existing private.idempotency_operations%rowtype;
  v_result jsonb;
begin
  select b.* into strict v_booking
  from public.bookings b join public.tenants t on t.id = b.tenant_id
  where t.slug = p_slug and b.access_token_hash = p_access_token_hash
  for update of b;
  select * into strict v_tenant from public.tenants where id = v_booking.tenant_id;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant.id::text || ':cancel:' || p_idempotency_key::text, 0));

  select * into v_existing from private.idempotency_operations
  where tenant_id = v_tenant.id and operation = 'cancel_booking' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = '22023', message = 'Ключ повтора уже использован с другими данными';
    end if;
    return v_existing.result;
  end if;

  if v_booking.status = 'cancelled' then
    v_result := jsonb_build_object('bookingId', v_booking.id, 'status', v_booking.status);
  else
    if now() > v_booking.starts_at - make_interval(hours => v_tenant.cancellation_hours) then
      raise exception using errcode = '22023', message = 'Срок самостоятельной отмены уже истёк';
    end if;
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking.id returning * into v_booking;
    update public.resource_occupancies set released_at = now() where booking_id = v_booking.id and released_at is null;
    update public.notification_jobs set state = 'suppressed'
      where booking_id = v_booking.id and state in ('pending', 'leased');
    perform private.enqueue_booking_job(v_tenant.id, v_booking.id, 'booking_cancelled', now(), extract(epoch from now())::bigint::text);
    v_result := jsonb_build_object('bookingId', v_booking.id, 'status', v_booking.status);
  end if;

  insert into private.idempotency_operations (tenant_id, operation, idempotency_key, request_hash, result)
  values (v_tenant.id, 'cancel_booking', p_idempotency_key, p_request_hash, v_result);
  return v_result;
end;
$$;

revoke all on function public.public_tenant_bootstrap(text) from public;
revoke all on function public.public_available_slots(text, text, date) from public;
revoke all on function public.server_create_booking(text, text, timestamptz, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_booking_by_token(text, text) from public, anon, authenticated;
revoke all on function public.server_cancel_booking(text, text, uuid, text) from public, anon, authenticated;

grant execute on function public.public_tenant_bootstrap(text) to anon, authenticated;
grant execute on function public.public_available_slots(text, text, date) to anon, authenticated;
grant execute on function public.server_create_booking(text, text, timestamptz, text, text, text, text, text, uuid, text) to service_role;
grant execute on function public.server_booking_by_token(text, text) to service_role;
grant execute on function public.server_cancel_booking(text, text, uuid, text) to service_role;
