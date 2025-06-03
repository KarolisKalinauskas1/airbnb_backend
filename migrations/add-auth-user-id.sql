-- Add auth_user_id column to users table if it doesn't exist

-- Check if the column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'auth_user_id'
    ) THEN
        -- Add the column
        EXECUTE 'ALTER TABLE public.users ADD COLUMN auth_user_id UUID';
        RAISE NOTICE 'Added auth_user_id column to users table';
        
        -- Create an index to improve lookup performance
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id)';
        RAISE NOTICE 'Created index on auth_user_id column';
    ELSE
        RAISE NOTICE 'auth_user_id column already exists in users table';
    END IF;
END$$;

-- Add a comment to explain the column's purpose
COMMENT ON COLUMN public.users.auth_user_id IS 'UUID from Supabase auth system to link users between auth and database';

-- Display the updated table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY ordinal_position;
