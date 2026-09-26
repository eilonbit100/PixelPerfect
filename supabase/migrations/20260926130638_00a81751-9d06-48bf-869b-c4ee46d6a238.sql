REVOKE EXECUTE ON FUNCTION public.freezes_apply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_freezes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.entry_block_reasons(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_in_customer(uuid,uuid), public.book_class(uuid,date,uuid), public.cancel_booking(uuid) FROM PUBLIC, anon;