alter table public.customers add column if not exists payment_method text, add column if not exists payment_method_details text;
alter table public.customers drop constraint if exists customers_payment_method_check;
alter table public.customers add constraint customers_payment_method_check check (payment_method is null or payment_method in ('CREDIT_CARD','STANDING_ORDER','CASH','BIT','BANK_TRANSFER','CHECK'));

create or replace function public.documents_to_compliance() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.customer_compliance_items i
     set status = case when r.key = 'HEALTH_DECLARATION' then 'PENDING' else 'VALID' end,
         completed_at = case when r.key = 'HEALTH_DECLARATION' then i.completed_at else now() end,
         metadata = i.metadata || jsonb_build_object('document_id', new.id)
  from public.compliance_requirements r
  where i.requirement_id = r.id and r.key = new.document_type and i.customer_id = new.customer_id
    and (i.status in ('MISSING','PENDING','EXPIRED') or (r.key = 'HEALTH_DECLARATION'));
  return new;
end $$;