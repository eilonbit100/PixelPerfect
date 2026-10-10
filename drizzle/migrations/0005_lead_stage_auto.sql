CREATE OR REPLACE FUNCTION public.leads_auto_stage() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.stage='LEAD' AND NEW.status IN ('CONTACT_ATTEMPT','FOLLOW_UP','TRIAL') THEN NEW.stage := 'PROSPECT'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leads_auto_stage BEFORE INSERT OR UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_auto_stage();