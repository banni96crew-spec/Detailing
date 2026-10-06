create function private.is_tenant_member(p_tenant_id uuid, p_roles public.member_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = (select auth.uid())
      and (p_roles is null or tm.role = any(p_roles))
  );
$$;

revoke all on function private.is_tenant_member(uuid, public.member_role[]) from public, anon, authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.resources enable row level security;
alter table public.services enable row level security;
alter table public.service_resources enable row level security;
alter table public.working_hours enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.information_cards enable row level security;
alter table public.gallery_items enable row level security;
alter table public.tenant_assets enable row level security;
alter table public.bookings enable row level security;
alter table public.resource_blocks enable row level security;
alter table public.resource_occupancies enable row level security;
alter table public.payments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_jobs enable row level security;

create policy tenants_member_select on public.tenants
for select to authenticated
using ((select private.is_tenant_member(id)));

create policy tenant_members_self_select on public.tenant_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy resources_member_all on public.resources
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy services_member_all on public.services
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy service_resources_member_all on public.service_resources
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy working_hours_member_all on public.working_hours
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy schedule_exceptions_member_all on public.schedule_exceptions
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy information_cards_member_all on public.information_cards
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy gallery_items_member_all on public.gallery_items
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy tenant_assets_member_all on public.tenant_assets
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy bookings_member_all on public.bookings
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy resource_blocks_member_all on public.resource_blocks
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy resource_occupancies_member_select on public.resource_occupancies
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy payments_member_all on public.payments
for all to authenticated
using ((select private.is_tenant_member(tenant_id)))
with check ((select private.is_tenant_member(tenant_id)));

create policy push_subscriptions_member_select on public.push_subscriptions
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

create policy notification_jobs_member_select on public.notification_jobs
for select to authenticated
using ((select private.is_tenant_member(tenant_id)));

revoke all on all tables in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.tenants, public.tenant_members, public.resources, public.services,
  public.service_resources, public.working_hours, public.schedule_exceptions,
  public.information_cards, public.gallery_items, public.tenant_assets,
  public.bookings, public.resource_blocks, public.resource_occupancies,
  public.payments, public.push_subscriptions, public.notification_jobs to authenticated;
grant insert, update, delete on public.resources, public.services, public.service_resources,
  public.working_hours, public.schedule_exceptions, public.information_cards,
  public.gallery_items, public.tenant_assets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-public',
  'tenant-public',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy tenant_public_read on storage.objects
for select to public
using (bucket_id = 'tenant-public');

create policy tenant_member_asset_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tenant-public'
  and (select private.is_tenant_member((storage.foldername(name))[1]::uuid))
);

create policy tenant_member_asset_update on storage.objects
for update to authenticated
using (
  bucket_id = 'tenant-public'
  and (select private.is_tenant_member((storage.foldername(name))[1]::uuid))
)
with check (
  bucket_id = 'tenant-public'
  and (select private.is_tenant_member((storage.foldername(name))[1]::uuid))
);

create policy tenant_member_asset_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'tenant-public'
  and (select private.is_tenant_member((storage.foldername(name))[1]::uuid))
);
