-- Create indexes for public_users table
CREATE INDEX IF NOT EXISTS public_users_auth_user_id_idx ON public.public_users(auth_user_id);
CREATE INDEX IF NOT EXISTS public_users_email_idx ON public.public_users(email);
CREATE INDEX IF NOT EXISTS public_users_auth_user_id_email_idx ON public.public_users(auth_user_id, email);
