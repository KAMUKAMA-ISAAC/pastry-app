-- Pastry Quin Management System: run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.cake_orders (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 order_date date not null default current_date,
 customer_name text not null check(length(trim(customer_name))>0),
 cake_type text not null check(length(trim(cake_type))>0),
 total_price numeric(14,0) not null check(total_price>0),
 expense numeric(14,0) not null default 0 check(expense>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.cake_payments (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 order_id uuid not null references public.cake_orders(id) on delete cascade,
 amount numeric(14,0) not null check(amount>0),
 payment_date date not null default current_date,
 note text,
 paid_at timestamptz not null default now()
);
create index if not exists cake_orders_owner_date on public.cake_orders(owner_id,order_date desc);
create index if not exists cake_payments_order on public.cake_payments(order_id);
create or replace function public.guard_cake_payment() returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_total numeric; v_paid numeric;
begin
 select owner_id,total_price into v_owner,v_total from public.cake_orders where id=new.order_id for update;
 if v_owner is null or v_owner<>auth.uid() or new.owner_id<>auth.uid() then raise exception 'Order not found or access denied'; end if;
 select coalesce(sum(amount),0) into v_paid from public.cake_payments where order_id=new.order_id and (tg_op<>'UPDATE' or id<>new.id);
 if v_paid+new.amount>v_total then raise exception 'Payment exceeds outstanding balance'; end if;
 return new;
end; $$;
drop trigger if exists cake_payment_guard on public.cake_payments;
create trigger cake_payment_guard before insert or update on public.cake_payments for each row execute function public.guard_cake_payment();
alter table public.cake_orders enable row level security;
alter table public.cake_payments enable row level security;
drop policy if exists owner_orders on public.cake_orders;
create policy owner_orders on public.cake_orders for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists owner_payments on public.cake_payments;
create policy owner_payments on public.cake_payments for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.cake_orders o where o.id=order_id and o.owner_id=auth.uid()));
grant select,insert,update,delete on public.cake_orders to authenticated;
grant select,insert,update,delete on public.cake_payments to authenticated;

-- Enforce worksheet rules at the database boundary as well as in the UI:
-- order date is assigned by the database on insert and cannot be backdated later.
create or replace function public.guard_cake_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric;
begin
  new.order_date := old.order_date;
  select coalesce(sum(amount), 0) into v_paid
  from public.cake_payments
  where order_id = old.id;
  if new.total_price < v_paid then
    raise exception 'Cake price cannot be lower than payments already received.';
  end if;
  return new;
end;
$$;

drop trigger if exists cake_order_update_guard on public.cake_orders;
create trigger cake_order_update_guard
before update on public.cake_orders
for each row execute function public.guard_cake_order_update();
