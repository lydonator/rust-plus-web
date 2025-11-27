import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/servers/[serverId]/workflows/[workflowId]/execute - Execute a workflow
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; workflowId: string }> }
) {
    try {
        const { serverId, workflowId } = await params;

        // Fetch workflow with actions
        const { data: workflow, error } = await supabaseAdmin
            .from('device_workflows')
            .select(`
                *,
                actions:workflow_actions(*)
            `)
            .eq('id', workflowId)
            .eq('server_id', serverId)
            .single();

        if (error || !workflow) {
            return NextResponse.json(
                { error: 'Workflow not found' },
                { status: 404 }
            );
        }

        if (!workflow.enabled) {
            return NextResponse.json(
                { error: 'Workflow is disabled' },
                { status: 400 }
            );
        }

        // Sort actions by order
        const actions = workflow.actions?.sort((a: any, b: any) => a.action_order - b.action_order) || [];

        if (actions.length === 0) {
            return NextResponse.json(
                { error: 'Workflow has no actions' },
                { status: 400 }
            );
        }

        // Process actions to resolve group IDs to entity IDs
        const processedActions = await Promise.all(
            actions.map(async (action: any) => {
                if (action.action_type === 'set_group' && action.action_config.group_id) {
                    // Fetch devices in this group
                    const { data: members } = await supabaseAdmin
                        .from('device_group_members')
                        .select('device_id')
                        .eq('group_id', action.action_config.group_id);

                    if (members && members.length > 0) {
                        const deviceIds = members.map(m => m.device_id);

                        // Fetch entity IDs for these devices
                        const { data: devices } = await supabaseAdmin
                            .from('smart_devices')
                            .select('entity_id')
                            .in('id', deviceIds)
                            .eq('type', 'switch');

                        const entityIds = devices?.map(d => d.entity_id) || [];

                        return {
                            ...action,
                            action_config: {
                                entity_ids: entityIds,
                                value: action.action_config.value
                            }
                        };
                    }
                }
                return action;
            })
        );

        // Send execution request to cloud-shim
        const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';

        const response = await fetch(`${shimUrl}/execute-workflow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serverId,
                workflowId,
                actions: processedActions
            })
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json(
                { error: error.message || 'Failed to execute workflow' },
                { status: 500 }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API] Error in POST /workflows/[workflowId]/execute:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
