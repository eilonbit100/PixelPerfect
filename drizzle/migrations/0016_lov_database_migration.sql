CREATE TABLE public.github_sync_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No public access: RLS enabled with no policies locks the table for all roles.
ALTER TABLE public.github_sync_test ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.github_sync_test IS 'Test table for verifying GitHub sync of schema changes. Removal pending sync verification.';