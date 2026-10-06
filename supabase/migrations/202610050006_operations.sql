create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.server_consume_counter(
  p_counter_kind text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_amount integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_used integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_amount < 1 then
    raise exception using errcode = '22023', message = 'Некорректные параметры счётчика';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from private.atomic_counters where expires_at < now() - interval '1 day';
  insert into private.atomic_counters (counter_kind, key_hash, window_start, used, expires_at)
  values (p_counter_kind, p_key_hash, v_window_start, p_amount, v_window_start + make_interval(secs => p_window_seconds))
  on conflict (counter_kind, key_hash, window_start) do update
    set used = private.atomic_counters.used + excluded.used
    where private.atomic_counters.used + excluded.used <= p_limit
  returning used into v_used;
  if v_used is null or v_used > p_limit then
    raise exception using errcode = 'P0001', message = 'Превышен допустимый предел запросов';
  end if;
  return v_used;
end;
$$;

create function public.server_register_booking_push(
  p_slug text,
  p_access_token_hash text,
  p_endpoint text,
  p_endpoint_hash text,
  p_p256dh text,
  p_auth_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_subscription_id uuid;
begin
  select b.* into strict v_booking
  from public.bookings b join public.tenants t on t.id = b.tenant_id
  where t.slug = p_slug and b.access_token_hash = p_access_token_hash;
  insert into public.push_subscriptions (
    tenant_id, booking_id, endpoint, endpoint_hash, p256dh, auth_secret, active
  ) values (
    v_booking.tenant_id, v_booking.id, p_endpoint, p_endpoint_hash, p_p256dh, p_auth_secret, true
  )
  on conflict (tenant_id, endpoint_hash) do update set
    booking_id = excluded.booking_id,
    user_id = null,
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    active = true
  returning id into v_subscription_id;
  return v_subscription_id;
end;
$$;

create function public.owner_register_push(
  p_slug text,
  p_endpoint text,
  p_endpoint_hash text,
  p_p256dh text,
  p_auth_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_subscription_id uuid;
begin
  select id into strict v_tenant_id from public.tenants where slug = p_slug;
  perform private.require_tenant_member(v_tenant_id);
  insert into public.push_subscriptions (
    tenant_id, user_id, endpoint, endpoint_hash, p256dh, auth_secret, active
  ) values (
    v_tenant_id, auth.uid(), p_endpoint, p_endpoint_hash, p_p256dh, p_auth_secret, true
  )
  on conflict (tenant_id, endpoint_hash) do update set
    booking_id = null,
    user_id = excluded.user_id,
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    active = true
  returning id into v_subscription_id;
  return v_subscription_id;
end;
$$;

create function public.server_lease_notification_jobs(p_limit integer, p_lease_seconds integer)
returns table (
  job_id uuid,
  lease_token uuid,
  tenant_id uuid,
  booking_id uuid,
  event_type text,
  payload jsonb,
  endpoint text,
  p256dh text,
  auth_secret text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select nj.id
    from public.notification_jobs nj
    where nj.channel = 'push'
      and nj.available_at <= now()
      and (nj.state = 'pending' or (nj.state = 'leased' and nj.leased_until < now()))
      and nj.attempts < 8
    order by nj.available_at, nj.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), leased as (
    update public.notification_jobs nj
    set state = 'leased',
        lease_token = gen_random_uuid(),
        leased_until = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 600))),
        attempts = nj.attempts + 1
    from candidates c
    where nj.id = c.id
    returning nj.*
  )
  select l.id, l.lease_token, l.tenant_id, l.booking_id, l.event_type, l.payload,
         ps.endpoint, ps.p256dh, ps.auth_secret
  from leased l
  left join public.push_subscriptions ps
    on ps.tenant_id = l.tenant_id and ps.active
   and (ps.booking_id = l.booking_id or ps.user_id in (
     select tm.user_id from public.tenant_members tm where tm.tenant_id = l.tenant_id
   ));
end;
$$;

create function public.server_finish_notification_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_sent boolean,
  p_error text default null,
  p_disable_endpoint text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_jobs
  set state = case
        when p_sent then 'sent'::public.notification_state
        when attempts >= 8 then 'failed'::public.notification_state
        else 'pending'::public.notification_state
      end,
      sent_at = case when p_sent then now() else sent_at end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Неизвестная ошибка'), 1000) end,
      lease_token = null,
      leased_until = null,
      available_at = case when p_sent then available_at else now() + make_interval(mins => least(60, (2 ^ least(attempts, 6))::integer)) end
  where id = p_job_id and lease_token = p_lease_token and state = 'leased';
  if not found then
    raise exception using errcode = 'P0002', message = 'Задача или аренда не найдена';
  end if;
  if p_disable_endpoint is not null then
    update public.push_subscriptions set active = false
    where endpoint = p_disable_endpoint;
  end if;
end;
$$;

create function public.admin_schedule_notification_dispatch(
  p_function_url text,
  p_cron_secret text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_job_id bigint;
begin
  if p_function_url !~ '^https://[^/]+/functions/v1/notification-dispatch$' then
    raise exception using errcode = '22023', message = 'Нужен HTTPS URL функции notification-dispatch';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'notification-dispatch-every-minute';
  select cron.schedule(
    'notification-dispatch-every-minute',
    '* * * * *',
    format(
      $command$select net.http_post(url := %L, headers := jsonb_build_object('content-type','application/json','x-cron-secret',%L), body := '{}'::jsonb);$command$,
      p_function_url,
      p_cron_secret
    )
  ) into v_job_id;
  return v_job_id;
end;
$$;

revoke all on function public.server_consume_counter(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.server_register_booking_push(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.server_lease_notification_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.server_finish_notification_job(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.admin_schedule_notification_dispatch(text, text) from public, anon, authenticated;
revoke all on function public.owner_register_push(text, text, text, text, text) from public, anon;

grant execute on function public.server_consume_counter(text, text, integer, integer, integer) to service_role;
grant execute on function public.server_register_booking_push(text, text, text, text, text, text) to service_role;
grant execute on function public.server_lease_notification_jobs(integer, integer) to service_role;
grant execute on function public.server_finish_notification_job(uuid, uuid, boolean, text, text) to service_role;
grant execute on function public.admin_schedule_notification_dispatch(text, text) to service_role;
grant execute on function public.owner_register_push(text, text, text, text, text) to authenticated;
