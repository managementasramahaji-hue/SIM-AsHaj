CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, legacy_id text UNIQUE NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL, UNIQUE(user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_role ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.account_migrations (legacy_id text PRIMARY KEY, email text UNIQUE NOT NULL, role text NOT NULL, claimed_by uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.account_migrations TO service_role;
ALTER TABLE public.account_migrations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role); $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,text) TO authenticated, service_role;
CREATE FUNCTION public.claim_migrated_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mapping public.account_migrations;
BEGIN
 IF NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO mapping FROM public.account_migrations WHERE lower(email)=lower(NEW.email) AND (claimed_by IS NULL OR claimed_by=NEW.id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.profiles(id,legacy_id,email) VALUES (NEW.id,mapping.legacy_id,lower(NEW.email)) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id,mapping.role) ON CONFLICT(user_id,role) DO NOTHING;
 UPDATE public.account_migrations SET claimed_by=NEW.id WHERE legacy_id=mapping.legacy_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.claim_migrated_account() FROM PUBLIC;
CREATE TRIGGER claim_migrated_account_after_confirmation AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.claim_migrated_account();