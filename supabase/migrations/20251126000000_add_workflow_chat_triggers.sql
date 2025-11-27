-- Add chat trigger support to device_workflows table
ALTER TABLE device_workflows
ADD COLUMN trigger_command VARCHAR(50),
ADD COLUMN save_state BOOLEAN DEFAULT false;

-- Create workflow_states table for state snapshots
CREATE TABLE workflow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES device_workflows(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  state_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX idx_workflow_states_workflow ON workflow_states(workflow_id);
CREATE INDEX idx_workflow_states_server ON workflow_states(server_id);
CREATE INDEX idx_workflow_states_created ON workflow_states(created_at DESC);
CREATE INDEX idx_device_workflows_trigger ON device_workflows(server_id, trigger_command) WHERE trigger_command IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN device_workflows.trigger_command IS 'Chat command to trigger workflow (e.g., !lockdown). If NULL, workflow is manual-only.';
COMMENT ON COLUMN device_workflows.save_state IS 'Whether to save device states before execution for restore capability';
COMMENT ON TABLE workflow_states IS 'Snapshots of device states before workflow execution for restore functionality';
