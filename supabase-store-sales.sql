-- Apply this file in Supabase before using the Bán hàng and Khách hàng tabs.
-- Prices and names are copied into invoice rows so historical reports never
-- change when a product price, product name, or customer name is edited later.

begin;

create sequence if not exists public.store_product_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.store_products (
  id text primary key,
  product_code bigint not null default nextval('public.store_product_code_seq'),
  name text not null,
  unit_price numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_products_name_not_blank check (btrim(name) <> ''),
  constraint store_products_product_code_positive check (product_code > 0),
  constraint store_products_unit_price_non_negative check (unit_price >= 0)
);

-- Upgrade existing products with short numeric codes that are easy to say,
-- for example: "mã 12 số lượng 3". New products receive the next code.
alter table public.store_products
  add column if not exists product_code bigint;

alter table public.store_products
  alter column product_code set default nextval('public.store_product_code_seq');

select setval(
  'public.store_product_code_seq',
  greatest(coalesce((select max(product_code) from public.store_products), 0) + 1, 1),
  false
);

update public.store_products
set product_code = nextval('public.store_product_code_seq')
where product_code is null;

select setval(
  'public.store_product_code_seq',
  greatest(coalesce((select max(product_code) from public.store_products), 0) + 1, 1),
  false
);

alter table public.store_products
  alter column product_code set not null;

alter sequence public.store_product_code_seq
  owned by public.store_products.product_code;

grant usage, select on sequence public.store_product_code_seq to anon, authenticated;

create unique index if not exists store_products_product_code_unique_idx
  on public.store_products (product_code);

create unique index if not exists store_products_name_unique_idx
  on public.store_products (lower(btrim(name)));

create table if not exists public.store_customers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_customers_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists store_customers_name_unique_idx
  on public.store_customers (lower(btrim(name)));

create table if not exists public.store_sales (
  id text primary key,
  customer_id text references public.store_customers(id) on delete set null,
  customer_name_snapshot text not null,
  sold_date date not null default current_date,
  total_amount numeric(16, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_sales_customer_name_not_blank check (btrim(customer_name_snapshot) <> ''),
  constraint store_sales_total_non_negative check (total_amount >= 0)
);

-- Upgrade an existing installation that previously blocked customer deletion.
-- The invoice keeps customer_name_snapshot, so historical data remains readable.
alter table public.store_sales alter column customer_id drop not null;
alter table public.store_sales drop constraint if exists store_sales_customer_id_fkey;
alter table public.store_sales
  add constraint store_sales_customer_id_fkey
  foreign key (customer_id) references public.store_customers(id) on delete set null;

create table if not exists public.store_sale_items (
  id text primary key,
  sale_id text not null references public.store_sales(id) on delete cascade,
  product_id text not null references public.store_products(id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(14, 2) not null,
  quantity numeric(12, 2) not null,
  line_total numeric(16, 2) not null,
  created_at timestamptz not null default now(),
  constraint store_sale_items_product_name_not_blank check (btrim(product_name_snapshot) <> ''),
  constraint store_sale_items_unit_price_non_negative check (unit_price_snapshot >= 0),
  constraint store_sale_items_quantity_positive check (quantity > 0),
  constraint store_sale_items_total_non_negative check (line_total >= 0),
  constraint store_sale_items_one_product_per_sale unique (sale_id, product_id)
);

create index if not exists store_sales_sold_date_idx
  on public.store_sales (sold_date desc, created_at desc);

create index if not exists store_sales_customer_idx
  on public.store_sales (customer_id, sold_date desc);

create index if not exists store_sale_items_product_idx
  on public.store_sale_items (product_id, created_at desc);

create or replace function public.touch_store_sales_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_store_products_updated_at on public.store_products;
create trigger touch_store_products_updated_at
before update on public.store_products
for each row execute function public.touch_store_sales_updated_at();

drop trigger if exists touch_store_customers_updated_at on public.store_customers;
create trigger touch_store_customers_updated_at
before update on public.store_customers
for each row execute function public.touch_store_sales_updated_at();

drop trigger if exists touch_store_sales_updated_at on public.store_sales;
create trigger touch_store_sales_updated_at
before update on public.store_sales
for each row execute function public.touch_store_sales_updated_at();

create or replace function public.save_store_sale(
  p_sale_id text,
  p_customer_id text,
  p_customer_name text,
  p_sold_date date,
  p_items jsonb,
  p_is_update boolean default false
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_customer_id text;
  v_customer_name text;
  v_existing_customer_id text;
  v_existing_customer_name text;
  v_item jsonb;
  v_product_id text;
  v_product_name text;
  v_unit_price numeric(14, 2);
  v_quantity numeric(12, 2);
  v_total numeric(16, 2) := 0;
  v_old_prices jsonb := '{}'::jsonb;
  v_old_names jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if p_sale_id is null or btrim(p_sale_id) = '' then
    raise exception 'sale id is required';
  end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer name is required';
  end if;
  if p_sold_date is null then
    raise exception 'sold date is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required';
  end if;

  if p_is_update then
    select customer_id, customer_name_snapshot
    into v_existing_customer_id, v_existing_customer_name
    from public.store_sales
    where id = p_sale_id
    for update;

    if not found then
      raise exception 'sale not found';
    end if;

    select
      coalesce(jsonb_object_agg(product_id, unit_price_snapshot), '{}'::jsonb),
      coalesce(jsonb_object_agg(product_id, product_name_snapshot), '{}'::jsonb)
    into v_old_prices, v_old_names
    from public.store_sale_items
    where sale_id = p_sale_id;
  end if;

  if p_is_update and p_customer_id = v_existing_customer_id then
    v_customer_id := v_existing_customer_id;
    v_customer_name := v_existing_customer_name;
  elsif p_customer_id is not null and btrim(p_customer_id) <> '' then
    select id, name into v_customer_id, v_customer_name
    from public.store_customers where id = p_customer_id;
  end if;

  if v_customer_id is null then
    select id, name into v_customer_id, v_customer_name
    from public.store_customers
    where lower(btrim(name)) = lower(btrim(p_customer_name))
    limit 1;
  end if;

  if v_customer_id is null then
    v_customer_id := coalesce(nullif(btrim(p_customer_id), ''), gen_random_uuid()::text);
    v_customer_name := btrim(p_customer_name);
    insert into public.store_customers (id, name) values (v_customer_id, v_customer_name);
  end if;

  if p_is_update then
    delete from public.store_sale_items where sale_id = p_sale_id;
    update public.store_sales
    set customer_id = v_customer_id,
        customer_name_snapshot = v_customer_name,
        sold_date = p_sold_date,
        total_amount = 0
    where id = p_sale_id;
  else
    insert into public.store_sales (
      id, customer_id, customer_name_snapshot, sold_date, total_amount
    ) values (
      p_sale_id, v_customer_id, v_customer_name, p_sold_date, 0
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := btrim(v_item ->> 'product_id');
    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_product_id is null or v_product_id = '' or v_quantity is null or v_quantity <= 0 then
      raise exception 'each item needs a product and positive quantity';
    end if;

    select name, unit_price into v_product_name, v_unit_price
    from public.store_products where id = v_product_id;

    if v_product_name is null then
      raise exception 'product % not found', v_product_id;
    end if;

    if p_is_update and v_old_prices ? v_product_id then
      v_unit_price := (v_old_prices ->> v_product_id)::numeric;
      v_product_name := v_old_names ->> v_product_id;
    end if;

    insert into public.store_sale_items (
      id,
      sale_id,
      product_id,
      product_name_snapshot,
      unit_price_snapshot,
      quantity,
      line_total
    ) values (
      coalesce(nullif(btrim(v_item ->> 'id'), ''), gen_random_uuid()::text),
      p_sale_id,
      v_product_id,
      v_product_name,
      round(v_unit_price, 2),
      round(v_quantity, 2),
      round(v_unit_price * v_quantity, 2)
    );

    v_total := v_total + round(v_unit_price * v_quantity, 2);
  end loop;

  update public.store_sales
  set total_amount = round(v_total, 2)
  where id = p_sale_id;

  select jsonb_build_object(
    'id', sale.id,
    'customer_id', sale.customer_id,
    'customer_name_snapshot', sale.customer_name_snapshot,
    'sold_date', sale.sold_date,
    'total_amount', sale.total_amount,
    'created_at', sale.created_at,
    'updated_at', sale.updated_at,
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at, item.id)
      from public.store_sale_items item
      where item.sale_id = sale.id
    ), '[]'::jsonb)
  ) into v_result
  from public.store_sales sale
  where sale.id = p_sale_id;

  return v_result;
end;
$$;

commit;
