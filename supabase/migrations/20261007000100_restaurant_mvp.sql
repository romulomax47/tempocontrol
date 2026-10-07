begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);
-- Credentials/email belong to Supabase Auth. One restaurant per user in this MVP.
create table public.restaurant_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  minimum double precision not null check (minimum > '-Infinity'::float8 and minimum < 'Infinity'::float8),
  maximum double precision not null check (maximum > '-Infinity'::float8 and maximum < 'Infinity'::float8),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (minimum <= maximum),
  unique (restaurant_id, id)
);
create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  equipment_id uuid not null,
  recorded_by uuid not null,
  temperature double precision not null check (temperature > '-Infinity'::float8 and temperature < 'Infinity'::float8),
  equipment_name text not null,
  responsible_name text not null,
  minimum double precision not null,
  maximum double precision not null,
  status text generated always as (
    case when temperature >= minimum and temperature <= maximum then 'normal' else 'alerta' end
  ) stored,
  recorded_at timestamptz not null default now(),
  foreign key (restaurant_id, equipment_id) references public.equipment(restaurant_id, id) on delete restrict,
  foreign key (restaurant_id, recorded_by) references public.restaurant_members(restaurant_id, user_id) on delete restrict
);
create index measurements_restaurant_history on public.measurements (restaurant_id, recorded_at desc, id desc);
create index equipment_restaurant on public.equipment (restaurant_id);

-- Definer helpers avoid recursive membership policies; never accept a user ID.
create function private.current_restaurant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select restaurant_id from public.restaurant_members where user_id = (select auth.uid());
$$;
create function private.is_restaurant_owner(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.restaurant_members
    where user_id = (select auth.uid()) and restaurant_id = target and role = 'owner');
$$;
revoke all on function private.current_restaurant_id() from public, anon;
revoke all on function private.is_restaurant_owner(uuid) from public, anon;
grant execute on function private.current_restaurant_id() to authenticated;
grant execute on function private.is_restaurant_owner(uuid) to authenticated;

alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.equipment enable row level security;
alter table public.measurements enable row level security;
create policy restaurant_read on public.restaurants for select to authenticated
  using (id = (select private.current_restaurant_id()));
create policy member_read on public.restaurant_members for select to authenticated
  using (restaurant_id = (select private.current_restaurant_id()));
create policy equipment_read on public.equipment for select to authenticated
  using (restaurant_id = (select private.current_restaurant_id()));
create policy equipment_create on public.equipment for insert to authenticated
  with check (restaurant_id = (select private.current_restaurant_id()) and private.is_restaurant_owner(restaurant_id));
create policy equipment_update on public.equipment for update to authenticated
  using (restaurant_id = (select private.current_restaurant_id()) and private.is_restaurant_owner(restaurant_id))
  with check (restaurant_id = (select private.current_restaurant_id()) and private.is_restaurant_owner(restaurant_id));
create policy measurement_read on public.measurements for select to authenticated
  using (restaurant_id = (select private.current_restaurant_id()));
create policy measurement_create on public.measurements for insert to authenticated
  with check (restaurant_id = (select private.current_restaurant_id()) and recorded_by = (select auth.uid()));
revoke all on public.restaurants, public.restaurant_members, public.equipment, public.measurements from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.restaurants, public.restaurant_members, public.equipment, public.measurements to authenticated;
grant insert (restaurant_id, name, minimum, maximum) on public.equipment to authenticated;
grant update (name, minimum, maximum, active) on public.equipment to authenticated;
grant insert (id, equipment_id, temperature) on public.measurements to authenticated;

create function public.create_restaurant(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); restaurant uuid;
begin
  if actor is null then raise exception 'Autenticação necessária.' using errcode = '42501'; end if;
  if exists (select 1 from public.restaurant_members where user_id = actor) then
    raise exception 'Usuário já vinculado a um restaurante.';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100
    or p_display_name is null or length(btrim(p_display_name)) not between 1 and 100 then
    raise exception 'Informe nomes válidos (até 100 caracteres).';
  end if;
  insert into public.restaurants (name) values (btrim(p_name)) returning id into restaurant;
  insert into public.restaurant_members (user_id, restaurant_id, display_name, role)
    values (actor, restaurant, btrim(p_display_name), 'owner');
  return restaurant;
end;
$$;
-- Only the owner can associate an existing, confirmed account, always as staff.
create function public.add_restaurant_member(p_email text, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare restaurant uuid := private.current_restaurant_id(); target uuid;
begin
  if restaurant is null or not private.is_restaurant_owner(restaurant) then
    raise exception 'Somente o proprietário pode associar responsáveis.' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 100 then
    raise exception 'Informe um nome válido (até 100 caracteres).';
  end if;
  select id into target from auth.users
    where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'Peça à pessoa para criar e confirmar sua conta primeiro.'; end if;
  if exists (select 1 from public.restaurant_members where user_id = target) then
    raise exception 'Essa conta já está vinculada a um restaurante.';
  end if;
  insert into public.restaurant_members (user_id, restaurant_id, display_name, role)
    values (target, restaurant, btrim(p_display_name), 'staff');
end;
$$;
-- The client cannot supply audit fields. FOR SHARE serializes limit changes.
create function private.prepare_measurement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare member public.restaurant_members%rowtype; device public.equipment%rowtype;
begin
  select * into member from public.restaurant_members where user_id = auth.uid();
  if not found then raise exception 'Usuário sem restaurante.' using errcode = '42501'; end if;
  select * into device from public.equipment
    where id = new.equipment_id and restaurant_id = member.restaurant_id and active for share;
  if not found then raise exception 'Selecione um equipamento ativo do seu restaurante.'; end if;
  new.restaurant_id := member.restaurant_id;
  new.recorded_by := member.user_id;
  new.responsible_name := member.display_name;
  new.equipment_name := device.name;
  new.minimum := device.minimum;
  new.maximum := device.maximum;
  new.recorded_at := clock_timestamp();
  return new;
end;
$$;
create trigger measurement_snapshot before insert on public.measurements
  for each row execute function private.prepare_measurement();
revoke all on function private.prepare_measurement() from public, anon, authenticated;
revoke all on function public.create_restaurant(text, text) from public, anon;
revoke all on function public.add_restaurant_member(text, text) from public, anon;
grant execute on function public.create_restaurant(text, text) to authenticated;
grant execute on function public.add_restaurant_member(text, text) to authenticated;
commit;
