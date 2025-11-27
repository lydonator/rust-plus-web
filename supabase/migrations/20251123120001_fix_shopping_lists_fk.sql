-- Fix foreign key constraint for shopping_lists.user_id
-- It should reference public.users(id), not auth.users(id)

-- Drop the existing foreign key constraint
ALTER TABLE shopping_lists
DROP CONSTRAINT IF EXISTS shopping_lists_user_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE shopping_lists
ADD CONSTRAINT shopping_lists_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
