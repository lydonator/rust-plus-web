-- Device Groups Migration
-- Adds support for organizing smart devices into groups

-- Device Groups table (zones/collections)
CREATE TABLE device_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT 'neutral', -- for visual distinction (e.g., 'blue', 'green', 'red')
  icon TEXT DEFAULT '📦',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Group Membership table (many-to-many relationship)
CREATE TABLE device_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE NOT NULL,
  device_id UUID REFERENCES smart_devices(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, device_id) -- Prevent duplicate memberships
);

-- Enable Row Level Security
ALTER TABLE device_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for device_groups
-- Users can only access groups for servers they own
CREATE POLICY device_groups_select_policy ON device_groups
  FOR SELECT
  USING (server_id IN (SELECT id FROM servers WHERE user_id = auth.uid()));

CREATE POLICY device_groups_insert_policy ON device_groups
  FOR INSERT
  WITH CHECK (server_id IN (SELECT id FROM servers WHERE user_id = auth.uid()));

CREATE POLICY device_groups_update_policy ON device_groups
  FOR UPDATE
  USING (server_id IN (SELECT id FROM servers WHERE user_id = auth.uid()));

CREATE POLICY device_groups_delete_policy ON device_groups
  FOR DELETE
  USING (server_id IN (SELECT id FROM servers WHERE user_id = auth.uid()));

-- RLS Policies for device_group_members
-- Users can only access memberships for groups they own
CREATE POLICY device_group_members_select_policy ON device_group_members
  FOR SELECT
  USING (group_id IN (
    SELECT id FROM device_groups
    WHERE server_id IN (SELECT id FROM servers WHERE user_id = auth.uid())
  ));

CREATE POLICY device_group_members_insert_policy ON device_group_members
  FOR INSERT
  WITH CHECK (group_id IN (
    SELECT id FROM device_groups
    WHERE server_id IN (SELECT id FROM servers WHERE user_id = auth.uid())
  ));

CREATE POLICY device_group_members_update_policy ON device_group_members
  FOR UPDATE
  USING (group_id IN (
    SELECT id FROM device_groups
    WHERE server_id IN (SELECT id FROM servers WHERE user_id = auth.uid())
  ));

CREATE POLICY device_group_members_delete_policy ON device_group_members
  FOR DELETE
  USING (group_id IN (
    SELECT id FROM device_groups
    WHERE server_id IN (SELECT id FROM servers WHERE user_id = auth.uid())
  ));

-- Create indexes for better query performance
CREATE INDEX idx_device_groups_server_id ON device_groups(server_id);
CREATE INDEX idx_device_group_members_group_id ON device_group_members(group_id);
CREATE INDEX idx_device_group_members_device_id ON device_group_members(device_id);
