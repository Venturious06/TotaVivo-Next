alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;

alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier in ('free', 'caregiver_premium', 'guardian_cloud', 'guardian_bundle'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guardian-evidence', 'guardian-evidence', false, 104857600, array['video/webm','video/mp4'])
on conflict (id) do update set public=false, file_size_limit=104857600, allowed_mime_types=array['video/webm','video/mp4'];

drop policy if exists "users upload their guardian evidence" on storage.objects;
create policy "users upload their guardian evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'guardian-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.household_members hm
    join public.subscriptions s on s.household_id = hm.household_id
    where hm.user_id = auth.uid()
      and s.status = 'active'
      and s.tier in ('guardian_cloud','guardian_bundle')
  )
);

drop policy if exists "users read their guardian evidence" on storage.objects;
create policy "users read their guardian evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'guardian-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.household_members hm
    join public.subscriptions s on s.household_id = hm.household_id
    where hm.user_id = auth.uid()
      and s.status = 'active'
      and s.tier in ('guardian_cloud','guardian_bundle')
  )
);
