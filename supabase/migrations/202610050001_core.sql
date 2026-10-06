create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.tenant_status as enum ('preview', 'live', 'suspended');
create type public.member_role as enum ('owner', 'staff');
create type public.booking_status as enum ('confirmed', 'accepted', 'ready', 'completed', 'cancelled', 'no_show');
create type public.payment_kind as enum ('payment', 'refund');
create type public.occupancy_kind as enum ('booking', 'block');
create type public.notification_state as enum ('pending', 'leased', 'sent', 'failed', 'suppressed');
create type public.asset_source as enum ('config', 'owner');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.tenant_status not null default 'preview',
  name text not null check (char_length(name) between 2 and 80),
  short_name text not null check (char_length(short_name) between 2 and 24),
  description text not null,
  timezone text not null,
  accent_color text not null check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  phone text not null,
  address text not null,
  directions_url text not null,
  slot_interval_minutes integer not null check (slot_interval_minutes between 5 and 120),
  minimum_lead_minutes integer not null default 0 check (minimum_lead_minutes between 0 and 43200),
  booking_horizon_days integer not null default 45 check (booking_horizon_days between 1 and 365),
  cancellation_hours integer not null default 12 check (cancellation_hours between 0 and 720),
  runtime_config jsonb not null default '{}'::jsonb,
  config_version bigint not null default 1,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_key text not null,
  name text not null,
  kind text not null check (kind in ('bay', 'lift', 'mobile-team')),
  source public.asset_source not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, resource_key)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_key text not null,
  name text not null,
  description text not null,
  current_price_cents integer not null check (current_price_cents > 0),
  duration_minutes integer not null check (duration_minutes between 15 and 43200),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 1440),
  featured boolean not null default false,
  source public.asset_source not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, service_key)
);

create table public.service_resources (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null,
  resource_id uuid not null,
  source public.asset_source not null default 'owner',
  primary key (tenant_id, service_id, resource_id),
  foreign key (tenant_id, service_id) references public.services(tenant_id, id) on delete cascade,
  foreign key (tenant_id, resource_id) references public.resources(tenant_id, id) on delete cascade
);

create table public.working_hours (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  closed boolean not null default false,
  opens_at time,
  last_arrival_at time,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, weekday),
  check (closed or (opens_at is not null and last_arrival_at is not null and opens_at <= last_arrival_at))
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid,
  unavailable_range tstzrange not null,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, resource_id) references public.resources(tenant_id, id) on delete cascade,
  check (not isempty(unavailable_range) and lower_inc(unavailable_range) and not upper_inc(unavailable_range))
);

create table public.information_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  card_key text not null,
  position smallint not null check (position between 1 and 3),
  title text not null,
  body text not null,
  source public.asset_source not null default 'owner',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, card_key),
  unique (tenant_id, position)
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gallery_key text not null,
  position integer not null check (position > 0),
  storage_path text not null,
  caption text not null,
  source public.asset_source not null default 'owner',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, gallery_key)
);

create table public.tenant_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_key text not null,
  storage_path text not null,
  source public.asset_source not null default 'owner',
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, source, asset_key)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  service_id uuid not null,
  resource_id uuid not null,
  status public.booking_status not null default 'confirmed',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_ends_at timestamptz not null,
  price_cents_snapshot integer not null check (price_cents_snapshot > 0),
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  buffer_minutes_snapshot integer not null check (buffer_minutes_snapshot >= 0),
  customer_name text not null,
  customer_phone_e164 text not null,
  vehicle text not null,
  notes text,
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  source text not null default 'client' check (source in ('client', 'owner')),
  is_demo boolean not null default false,
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, access_token_hash),
  foreign key (tenant_id, service_id) references public.services(tenant_id, id) on delete restrict,
  foreign key (tenant_id, resource_id) references public.resources(tenant_id, id) on delete restrict,
  check (starts_at < ends_at and ends_at <= buffer_ends_at)
);

create table public.resource_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null,
  blocked_range tstzrange not null,
  label text not null,
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, resource_id) references public.resources(tenant_id, id) on delete cascade,
  check (not isempty(blocked_range) and lower_inc(blocked_range) and not upper_inc(blocked_range))
);

create table public.resource_occupancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null,
  booking_id uuid,
  block_id uuid,
  kind public.occupancy_kind not null,
  occupied_range tstzrange not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (booking_id),
  unique (block_id),
  foreign key (tenant_id, resource_id) references public.resources(tenant_id, id) on delete cascade,
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete cascade,
  foreign key (tenant_id, block_id) references public.resource_blocks(tenant_id, id) on delete cascade,
  check ((kind = 'booking' and booking_id is not null and block_id is null) or (kind = 'block' and block_id is not null and booking_id is null)),
  check (not isempty(occupied_range) and lower_inc(occupied_range) and not upper_inc(occupied_range)),
  exclude using gist (
    tenant_id with =,
    resource_id with =,
    occupied_range with &&
  ) where (released_at is null)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  booking_id uuid not null,
  kind public.payment_kind not null,
  amount_cents integer not null check (amount_cents > 0),
  received_at timestamptz not null,
  note text,
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete restrict
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid,
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  endpoint_hash text not null check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  p256dh text not null,
  auth_secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, endpoint_hash),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete cascade,
  check ((booking_id is not null) <> (user_id is not null))
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid,
  event_type text not null,
  channel text not null check (channel in ('push', 'email')),
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  state public.notification_state not null default 'pending',
  lease_token uuid,
  leased_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key),
  foreign key (tenant_id, booking_id) references public.bookings(tenant_id, id) on delete cascade
);

create table private.idempotency_operations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, operation, idempotency_key)
);

create table private.atomic_counters (
  counter_kind text not null,
  key_hash text not null,
  window_start timestamptz not null,
  used integer not null check (used >= 0),
  expires_at timestamptz not null,
  primary key (counter_kind, key_hash, window_start)
);

create index bookings_tenant_start_idx on public.bookings (tenant_id, starts_at);
create index bookings_tenant_status_idx on public.bookings (tenant_id, status, starts_at);
create index payments_tenant_received_idx on public.payments (tenant_id, received_at);
create index occupancies_resource_range_idx on public.resource_occupancies using gist (tenant_id, resource_id, occupied_range);
create index schedule_exceptions_range_idx on public.schedule_exceptions using gist (tenant_id, unavailable_range);
create index notification_jobs_ready_idx on public.notification_jobs (state, available_at) where state in ('pending', 'leased');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at before update on public.tenants for each row execute function private.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute function private.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function private.set_updated_at();
create trigger bookings_updated_at before update on public.bookings for each row execute function private.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions for each row execute function private.set_updated_at();

comment on table public.resource_occupancies is 'Единый источник конфликтов для записей и ручных блокировок; диапазоны полуоткрытые [start,end).';
comment on column public.bookings.price_cents_snapshot is 'Историческая цена на момент создания записи, не текущая цена услуги.';
comment on column public.bookings.access_token_hash is 'SHA-256 hash. Исходный токен выводится Edge Function детерминированно и в БД не хранится.';
