CREATE TABLE public.github_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token_ciphertext text NOT NULL,
  github_login text,
  github_avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.github_connections TO service_role;

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;