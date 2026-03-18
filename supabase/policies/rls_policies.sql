alter table public.profiles enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own bookings" on public.bookings;
create policy "Users can view own bookings"
on public.bookings
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own bookings" on public.bookings;
create policy "Users can insert own bookings"
on public.bookings
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own bookings status" on public.bookings;
drop policy if exists "Users can update own bookings" on public.bookings;
create policy "Users can update own bookings"
on public.bookings
for update
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and status in ('pending', 'cancelled')
);
