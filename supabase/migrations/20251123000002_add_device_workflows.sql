-- Create enum for workflow trigger types
CREATE TYPE workflow_trigger_type AS ENUM (
    'manual',           -- Triggered manually by user
    'device_state',     -- Triggered when a device changes state
    'time',             -- Triggered at a specific time
    'storage_level'     -- Triggered when storage reaches threshold
);

-- Create enum for workflow action types
CREATE TYPE workflow_action_type AS ENUM (
    'set_device',       -- Set a device to a specific state
    'set_group',        -- Set all devices in a group to a state
    'wait',             -- Wait for a duration
    'notify'            -- Send a notification (future)
);

-- Create workflows table
CREATE TABLE IF NOT EXISTS device_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,

    -- Trigger configuration
    trigger_type workflow_trigger_type NOT NULL,
    trigger_config JSONB DEFAULT '{}',  -- Stores trigger-specific configuration

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create workflow actions table (ordered sequence of actions)
CREATE TABLE IF NOT EXISTS workflow_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES device_workflows(id) ON DELETE CASCADE NOT NULL,
    action_order INTEGER NOT NULL,  -- Order of execution
    action_type workflow_action_type NOT NULL,
    action_config JSONB NOT NULL,   -- Stores action-specific configuration

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_server_id ON device_workflows(server_id);
CREATE INDEX IF NOT EXISTS idx_workflows_enabled ON device_workflows(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_workflow_actions_workflow_id ON workflow_actions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_order ON workflow_actions(workflow_id, action_order);

-- Enable Row Level Security
ALTER TABLE device_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for device_workflows
CREATE POLICY "Users can view their own workflows"
    ON device_workflows FOR SELECT
    USING (
        server_id IN (
            SELECT id FROM servers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create workflows for their servers"
    ON device_workflows FOR INSERT
    WITH CHECK (
        server_id IN (
            SELECT id FROM servers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own workflows"
    ON device_workflows FOR UPDATE
    USING (
        server_id IN (
            SELECT id FROM servers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own workflows"
    ON device_workflows FOR DELETE
    USING (
        server_id IN (
            SELECT id FROM servers WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for workflow_actions
CREATE POLICY "Users can view actions for their workflows"
    ON workflow_actions FOR SELECT
    USING (
        workflow_id IN (
            SELECT w.id FROM device_workflows w
            JOIN servers s ON w.server_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create actions for their workflows"
    ON workflow_actions FOR INSERT
    WITH CHECK (
        workflow_id IN (
            SELECT w.id FROM device_workflows w
            JOIN servers s ON w.server_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update actions for their workflows"
    ON workflow_actions FOR UPDATE
    USING (
        workflow_id IN (
            SELECT w.id FROM device_workflows w
            JOIN servers s ON w.server_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete actions for their workflows"
    ON workflow_actions FOR DELETE
    USING (
        workflow_id IN (
            SELECT w.id FROM device_workflows w
            JOIN servers s ON w.server_id = s.id
            WHERE s.user_id = auth.uid()
        )
    );
