-- Create profiles table function
CREATE OR REPLACE FUNCTION create_profiles_table(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
      full_name text,
      email text,
      avatar_url text,
      isowner boolean DEFAULT false,
      created_at timestamp with time zone DEFAULT timezone(''utc''::text, now()) NOT NULL,
      updated_at timestamp with time zone DEFAULT timezone(''utc''::text, now()) NOT NULL
    );
  ', table_name);
END;
$$;

-- Create profiles policies function
CREATE OR REPLACE FUNCTION create_profiles_policies(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Enable RLS
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_name);

  -- Create policies
  EXECUTE format('
    CREATE POLICY "Users can view their own profile"
      ON public.%I FOR SELECT
      USING (auth.uid() = id);

    CREATE POLICY "Users can update their own profile"
      ON public.%I FOR UPDATE
      USING (auth.uid() = id);

    CREATE POLICY "Users can insert their own profile"
      ON public.%I FOR INSERT
      WITH CHECK (auth.uid() = id);
  ', table_name, table_name, table_name);
END;
$$; 