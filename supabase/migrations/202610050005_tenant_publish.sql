create function public.admin_publish_tenant(p_config jsonb, p_activate_live boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_slug text := p_config ->> 'slug';
  v_resource jsonb;
  v_service jsonb;
  v_card jsonb;
  v_gallery jsonb;
  v_hour jsonb;
  v_resource_id uuid;
  v_service_id uuid;
  v_key text;
  v_asset record;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'Некорректный slug студии';
  end if;
  if jsonb_array_length(coalesce(p_config -> 'resources', '[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(p_config -> 'services', '[]'::jsonb)) < 1
     or jsonb_array_length(coalesce(p_config -> 'hours', '[]'::jsonb)) <> 7 then
    raise exception using errcode = '22023', message = 'Для публикации нужны ресурсы, услуги и семь дней графика';
  end if;

  insert into public.tenants (
    slug, status, name, short_name, description, timezone, accent_color,
    phone, address, directions_url, slot_interval_minutes, minimum_lead_minutes,
    booking_horizon_days, cancellation_hours, runtime_config, config_version, published_at
  ) values (
    v_slug,
    case when p_activate_live then 'live'::public.tenant_status else 'preview'::public.tenant_status end,
    p_config #>> '{brand,name}', p_config #>> '{brand,shortName}', p_config #>> '{brand,description}',
    p_config ->> 'timezone', p_config #>> '{brand,accent}', p_config #>> '{contact,phone}',
    p_config #>> '{contact,address}', p_config #>> '{contact,directionsUrl}',
    (p_config #>> '{booking,slotIntervalMinutes}')::integer,
    (p_config #>> '{booking,minimumLeadMinutes}')::integer,
    (p_config #>> '{booking,horizonDays}')::integer,
    (p_config #>> '{booking,cancellationHours}')::integer,
    p_config, 1, now()
  )
  on conflict (slug) do update set
    status = case when p_activate_live then 'live'::public.tenant_status else public.tenants.status end,
    name = excluded.name,
    short_name = excluded.short_name,
    description = excluded.description,
    timezone = excluded.timezone,
    accent_color = excluded.accent_color,
    phone = excluded.phone,
    address = excluded.address,
    directions_url = excluded.directions_url,
    slot_interval_minutes = excluded.slot_interval_minutes,
    minimum_lead_minutes = excluded.minimum_lead_minutes,
    booking_horizon_days = excluded.booking_horizon_days,
    cancellation_hours = excluded.cancellation_hours,
    runtime_config = excluded.runtime_config,
    config_version = public.tenants.config_version + 1,
    published_at = now()
  returning id into v_tenant_id;

  update public.resources set active = false
  where tenant_id = v_tenant_id and source = 'config'
    and resource_key not in (select value ->> 'key' from jsonb_array_elements(p_config -> 'resources'));
  for v_resource in select value from jsonb_array_elements(p_config -> 'resources') loop
    insert into public.resources (tenant_id, resource_key, name, kind, source, active)
    values (v_tenant_id, v_resource ->> 'key', v_resource ->> 'name', v_resource ->> 'kind', 'config', true)
    on conflict (tenant_id, resource_key) do update set
      name = excluded.name, kind = excluded.kind, active = true
    returning id into v_resource_id;
  end loop;

  update public.services set active = false
  where tenant_id = v_tenant_id and source = 'config'
    and service_key not in (select value ->> 'key' from jsonb_array_elements(p_config -> 'services'));
  for v_service in select value from jsonb_array_elements(p_config -> 'services') loop
    insert into public.services (
      tenant_id, service_key, name, description, current_price_cents,
      duration_minutes, buffer_minutes, featured, source, active
    ) values (
      v_tenant_id, v_service ->> 'key', v_service ->> 'name', v_service ->> 'description',
      (v_service ->> 'priceCents')::integer, (v_service ->> 'durationMinutes')::integer,
      (v_service ->> 'bufferMinutes')::integer, coalesce((v_service ->> 'featured')::boolean, false),
      'config', true
    )
    on conflict (tenant_id, service_key) do update set
      name = excluded.name,
      description = excluded.description,
      current_price_cents = excluded.current_price_cents,
      duration_minutes = excluded.duration_minutes,
      buffer_minutes = excluded.buffer_minutes,
      featured = excluded.featured,
      active = true
    returning id into v_service_id;

    delete from public.service_resources where tenant_id = v_tenant_id and service_id = v_service_id and source = 'config';
    for v_key in select jsonb_array_elements_text(v_service -> 'resourceKeys') loop
      select id into strict v_resource_id from public.resources
      where tenant_id = v_tenant_id and resource_key = v_key and active;
      insert into public.service_resources (tenant_id, service_id, resource_id, source)
      values (v_tenant_id, v_service_id, v_resource_id, 'config')
      on conflict do nothing;
    end loop;
  end loop;

  for v_hour in select value from jsonb_array_elements(p_config -> 'hours') loop
    insert into public.working_hours (tenant_id, weekday, closed, opens_at, last_arrival_at)
    values (
      v_tenant_id,
      (v_hour ->> 'weekday')::smallint,
      (v_hour ->> 'closed')::boolean,
      nullif(v_hour ->> 'opensAt', '')::time,
      nullif(v_hour ->> 'lastArrivalAt', '')::time
    )
    on conflict (tenant_id, weekday) do update set
      closed = excluded.closed,
      opens_at = excluded.opens_at,
      last_arrival_at = excluded.last_arrival_at,
      updated_at = now();
  end loop;

  update public.information_cards set active = false where tenant_id = v_tenant_id and source = 'config';
  for v_card in select value from jsonb_array_elements(p_config -> 'infoCards') with ordinality as x(value, position) loop
    insert into public.information_cards (tenant_id, card_key, position, title, body, source, active)
    values (
      v_tenant_id,
      v_card ->> 'key',
      (select ordinality::smallint from jsonb_array_elements(p_config -> 'infoCards') with ordinality x(value, ordinality) where x.value = v_card limit 1),
      v_card ->> 'title',
      v_card ->> 'text',
      'config',
      true
    )
    on conflict (tenant_id, card_key) do update set title = excluded.title, body = excluded.body, active = true;
  end loop;

  update public.gallery_items set active = false where tenant_id = v_tenant_id and source = 'config';
  for v_gallery in select value from jsonb_array_elements(p_config -> 'gallery') loop
    insert into public.gallery_items (tenant_id, gallery_key, position, storage_path, caption, source, active)
    values (
      v_tenant_id,
      v_gallery ->> 'key',
      (select ordinality::integer from jsonb_array_elements(p_config -> 'gallery') with ordinality x(value, ordinality) where x.value = v_gallery limit 1),
      coalesce(
        (select item ->> 'image' from jsonb_array_elements(p_config #> '{assets,gallery}') item where item ->> 'key' = v_gallery ->> 'key'),
        v_gallery ->> 'image'
      ),
      v_gallery ->> 'caption',
      'config',
      true
    )
    on conflict (tenant_id, gallery_key) do update set
      storage_path = excluded.storage_path,
      caption = excluded.caption,
      active = true
    where public.gallery_items.source = 'config';
  end loop;

  for v_asset in
    select asset_key, storage_path from public.tenant_assets
    where tenant_id = v_tenant_id and source = 'owner' and asset_key in ('logo', 'hero')
  loop
    update public.tenants
    set runtime_config = jsonb_set(runtime_config, array['assets', v_asset.asset_key], to_jsonb(v_asset.storage_path), true)
    where id = v_tenant_id;
  end loop;

  return v_tenant_id;
end;
$$;

revoke all on function public.admin_publish_tenant(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_publish_tenant(jsonb, boolean) to service_role;
