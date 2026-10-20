CREATE TABLE public.server_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.server_store TO service_role;
ALTER TABLE public.server_store ENABLE ROW LEVEL SECURITY;