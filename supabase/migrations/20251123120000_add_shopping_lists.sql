-- Create shopping_lists table
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX shopping_lists_user_server_idx ON shopping_lists(user_id, server_id);
CREATE INDEX shopping_lists_item_idx ON shopping_lists(item_id);

-- Enable RLS
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own shopping lists
CREATE POLICY "Users can view own shopping lists"
  ON shopping_lists
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own shopping list items
CREATE POLICY "Users can insert own shopping list items"
  ON shopping_lists
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own shopping list items
CREATE POLICY "Users can delete own shopping list items"
  ON shopping_lists
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add unique constraint to prevent duplicate items per user per server
CREATE UNIQUE INDEX shopping_lists_unique_item
  ON shopping_lists(user_id, server_id, item_id);

-- Comment on table
COMMENT ON TABLE shopping_lists IS 'User shopping lists for tracking vending machine items';
COMMENT ON COLUMN shopping_lists.item_id IS 'Item ID from rust-items.json';
COMMENT ON COLUMN shopping_lists.item_name IS 'Cached item name for easier querying';
