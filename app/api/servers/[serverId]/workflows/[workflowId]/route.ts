import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// PATCH /api/servers/[serverId]/workflows/[workflowId] - Update a workflow
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; workflowId: string }> }
) {
    try {
        const { serverId, workflowId } = await params;
        const body = await request.json();

        const { name, description, enabled, trigger_type, trigger_config, trigger_command, save_state, actions } = body;

        // Verify workflow belongs to this server
        const { data: workflow, error: verifyError } = await supabaseAdmin
            .from('device_workflows')
            .select('id')
            .eq('id', workflowId)
            .eq('server_id', serverId)
            .single();

        if (verifyError || !workflow) {
            return NextResponse.json(
                { error: 'Workflow not found' },
                { status: 404 }
            );
        }

        // Build update object
        const updates: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return NextResponse.json(
                    { error: 'Workflow name cannot be empty' },
                    { status: 400 }
                );
            }
            updates.name = name.trim();
        }
        if (description !== undefined) updates.description = description?.trim() || null;
        if (enabled !== undefined) updates.enabled = enabled;
        if (trigger_type !== undefined) updates.trigger_type = trigger_type;
        if (trigger_config !== undefined) updates.trigger_config = trigger_config;
        if (trigger_command !== undefined) updates.trigger_command = trigger_command?.trim().toLowerCase() || null;
        if (save_state !== undefined) updates.save_state = save_state;

        // Update the workflow
        const { data: updatedWorkflow, error: updateError } = await supabaseAdmin
            .from('device_workflows')
            .update(updates)
            .eq('id', workflowId)
            .select()
            .single();

        if (updateError) {
            console.error('[API] Error updating workflow:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Update actions if provided
        if (actions && Array.isArray(actions)) {
            // Delete existing actions
            await supabaseAdmin
                .from('workflow_actions')
                .delete()
                .eq('workflow_id', workflowId);

            // Insert new actions
            if (actions.length > 0) {
                const actionInserts = actions.map((action: any, index: number) => ({
                    workflow_id: workflowId,
                    action_order: index,
                    action_type: action.action_type,
                    action_config: action.action_config
                }));

                const { error: actionsError } = await supabaseAdmin
                    .from('workflow_actions')
                    .insert(actionInserts);

                if (actionsError) {
                    console.error('[API] Error updating workflow actions:', actionsError);
                    return NextResponse.json({ error: actionsError.message }, { status: 500 });
                }
            }
        }

        // Fetch complete workflow with actions
        const { data: completeWorkflow } = await supabaseAdmin
            .from('device_workflows')
            .select(`*, actions:workflow_actions(*)`)
            .eq('id', workflowId)
            .single();

        return NextResponse.json(completeWorkflow);
    } catch (error: any) {
        console.error('[API] Error in PATCH /workflows/[workflowId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/servers/[serverId]/workflows/[workflowId] - Delete a workflow
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; workflowId: string }> }
) {
    try {
        const { serverId, workflowId } = await params;

        // Verify workflow belongs to this server
        const { data: workflow, error: verifyError } = await supabaseAdmin
            .from('device_workflows')
            .select('id')
            .eq('id', workflowId)
            .eq('server_id', serverId)
            .single();

        if (verifyError || !workflow) {
            return NextResponse.json(
                { error: 'Workflow not found' },
                { status: 404 }
            );
        }

        // Delete the workflow (CASCADE will delete actions)
        const { error } = await supabaseAdmin
            .from('device_workflows')
            .delete()
            .eq('id', workflowId);

        if (error) {
            console.error('[API] Error deleting workflow:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API] Error in DELETE /workflows/[workflowId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
