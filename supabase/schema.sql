begin;

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  code text not null check (char_length(code) <= 200 and code ~ '[^[:space:]]'),
  name text not null check (char_length(name) <= 200 and name ~ '[^[:space:]]'),
  unique (user_id, id)
);
create unique index equipment_user_code on public.equipment (user_id, lower(btrim(code)));

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  name text not null check (char_length(name) <= 200 and name ~ '[^[:space:]]'),
  minimum integer not null check (minimum between 0 and 1000000),
  stock bigint not null default 0 check (stock >= 0),
  cost numeric(10,2) not null default 0 check (cost >= 0),
  unique (user_id, id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  part uuid not null,
  date date not null check (date between date '0001-01-01' and date '9999-12-31'),
  supplier text not null check (char_length(supplier) <= 200 and supplier ~ '[^[:space:]]'),
  quantity integer not null check (quantity between 1 and 1000000),
  cost numeric(10,2) not null check (cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, part) references public.parts (user_id, id)
);

create table public.maintenance_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  equipment uuid not null,
  description text not null check (char_length(description) <= 200 and description ~ '[^[:space:]]'),
  owner text not null check (char_length(owner) <= 200 and owner ~ '[^[:space:]]'),
  closed boolean not null default false,
  unique (user_id, id),
  foreign key (user_id, equipment) references public.equipment (user_id, id)
);
create unique index one_open_order_per_equipment
  on public.maintenance_orders (user_id, equipment) where not closed;

create table public.part_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users,
  order_id uuid not null,
  part uuid not null,
  quantity integer not null check (quantity between 1 and 1000000),
  cost numeric(10,2) not null check (cost >= 0),
  foreign key (user_id, order_id) references public.maintenance_orders (user_id, id),
  foreign key (user_id, part) references public.parts (user_id, id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['equipment', 'parts', 'purchases', 'maintenance_orders', 'part_usage']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format(
      'create policy own_records on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

create function public.inventory_state() returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'equipment', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.code) from public.equipment e), '[]'),
    'parts', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by p.name) from public.parts p), '[]'),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by p.date desc, p.created_at desc) from public.purchases p), '[]'),
    'orders', coalesce((
      select jsonb_agg((to_jsonb(o) - 'user_id') || jsonb_build_object(
        'used', coalesce((
          select jsonb_agg(to_jsonb(u) - 'user_id' - 'order_id')
          from public.part_usage u where u.order_id = o.id
        ), '[]')
      ) order by o.closed, o.id)
      from public.maintenance_orders o
    ), '[]')
  );
$$;

create function public.inventory_write(action text, fields jsonb, record_id uuid default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  part_id uuid;
  amount integer;
  unit_cost numeric(10,2);
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Entre na sua conta.';
  end if;

  select jsonb_object_agg(key, regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    into fields from jsonb_each_text(fields);

  case action
  when 'equipment' then
    insert into public.equipment (user_id, code, name)
      values (actor, fields->>'code', fields->>'name');
  when 'part' then
    insert into public.parts (user_id, name, minimum)
      values (actor, fields->>'name', (fields->>'minimum')::integer);
  when 'purchase' then
    part_id := (fields->>'part')::uuid;
    amount := (fields->>'quantity')::integer;
    if (fields->>'cost') is null or (fields->>'cost') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
      or (fields->>'date') is null or (fields->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Informe um custo e uma data válidos.';
    end if;
    unit_cost := (fields->>'cost')::numeric;
    insert into public.purchases (user_id, part, date, supplier, quantity, cost)
      values (actor, part_id, (fields->>'date')::date, fields->>'supplier', amount, unit_cost);
    update public.parts set stock = stock + amount, cost = unit_cost
      where user_id = actor and id = part_id;
  when 'order' then
    insert into public.maintenance_orders (user_id, equipment, description, owner)
      values (actor, (fields->>'equipment')::uuid, fields->>'description', fields->>'owner');
  when 'consume' then
    perform 1 from public.maintenance_orders
      where user_id = actor and id = record_id and not closed for update;
    if not found then
      raise exception 'A ordem precisa estar aberta.';
    end if;

    part_id := (fields->>'part')::uuid;
    amount := (fields->>'quantity')::integer;
    if amount is null or amount not between 1 and 1000000 then
      raise exception 'Informe uma quantidade inteira válida.';
    end if;
    update public.parts set stock = stock - amount
      where user_id = actor and id = part_id and stock >= amount returning cost into unit_cost;
    if not found then
      raise exception 'Peça indisponível ou saldo insuficiente.';
    end if;
    insert into public.part_usage (user_id, order_id, part, quantity, cost)
      values (actor, record_id, part_id, amount, unit_cost);
  when 'finish' then
    update public.maintenance_orders set closed = true
      where user_id = actor and id = record_id and not closed;
    if not found then
      raise exception 'A ordem precisa estar aberta.';
    end if;
  else
    raise exception 'Operação inválida.';
  end case;
exception
  when unique_violation then
    if action = 'equipment' then
      raise exception 'Já existe um equipamento com esse código.';
    end if;
    raise exception 'Esse equipamento já tem uma ordem em aberto.';
  when check_violation or not_null_violation or data_exception then
    raise exception 'Preencha todos os campos com valores válidos.';
  when foreign_key_violation then
    raise exception 'Equipamento ou peça indisponível.';
end;
$$;

revoke all on function public.inventory_state(), public.inventory_write(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.inventory_state(), public.inventory_write(text, jsonb, uuid) to authenticated;

commit;
