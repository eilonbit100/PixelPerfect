ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS return_window_days integer;

ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_return_window_days_check
  CHECK (return_window_days IS NULL OR return_window_days >= 0);

COMMENT ON COLUMN public.inventory_products.return_window_days IS
  'Product-specific supplier return window in days for new receipt lots; falls back to supplier default when null.';

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.apply_inventory_transaction(uuid,uuid,text,numeric,text,text,boolean,text,date,text,text,text,text,uuid,uuid,jsonb)'::regprocedure);
  d := replace(
    d,
    '    select default_return_window_days into _win from public.suppliers where id=_sup;',
    '    _win := _p.return_window_days;
    if _win is null then
      select default_return_window_days into _win from public.suppliers where id=_sup;
    end if;'
  );
  IF position('_win := _p.return_window_days' in d) = 0 THEN
    RAISE EXCEPTION 'apply_inventory_transaction return-window patch failed';
  END IF;
  EXECUTE d;
END $do$;