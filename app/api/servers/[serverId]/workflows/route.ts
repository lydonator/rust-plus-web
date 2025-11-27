import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/servers/[serverId]/workflows - Get all workflows for a server
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string }> }
) {
    try {
        const { serverId } = await params;

        // Fetch all workflows with their actions
        const { data: workflows, error } = await supabaseAdmin
            .from('device_workflows')
            .select(`
                *,
                actions:workflow_actions(*)
            `)
            .eq('server_id', serverId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[API] Error fetching workflows:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Sort actions by action_order for each workflow
        const workflowsWithSortedActions = workflows?.map(workflow => ({
            ...workflow,
            actions: workflow.actions?.sort((a: any, b: any) => a.action_order - b.action_order) || []
        }));

        return NextResponse.json(workflowsWithSortedActions || []);
    } catch (error: any) {
        console.error('[API] Error in GET /workflows:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/servers/[serverId]/workflows - Create a new workflow
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string }> }
) {
    try {
        const { serverId } = await params;
        const body = await request.json();

        const { name, description, trigger_type, trigger_config, actions, trigger_command, save_state } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Workflow name is required' },
                { status: 400 }
            );
        }

        if (!trigger_type) {
            return NextResponse.json(
                { error: 'Trigger type is required' },
                { status: 400 }
            );
        }

        // Validate chat trigger command
        if (trigger_command) {
            const trimmedCommand = trigger_command.trim();
            if (!trimmedCommand.startsWith('!')) {
                return NextResponse.json(
                    { error: 'Chat trigger command must start with !' },
                    { status: 400 }
                );
            }
            if (trimmedCommand.length < 2) {
                return NextResponse.json(
                    { error: 'Chat trigger command must be at least 2 characters' },
                    { status: 400 }
                );
            }
        }

        // Create the workflow
        const { data: workflow, error: workflowError } = await supabaseAdmin
            .from('device_workflows')
            .insert({
                server_id: serverId,
                name: name.trim(),
                description: description?.trim() || null,
                trigger_type,
                trigger_config: trigger_config || {},
                trigger_command: trigger_command?.trim().toLowerCase() || null,
                save_state: save_state || false,
                enabled: true
            })
            .select()
            .single();

        if (workflowError) {
            console.error('[API] Error creating workflow:', workflowError);
            return NextResponse.json({ error: workflowError.message }, { status: 500 });
        }

        // Create workflow actions if provided
        if (actions && Array.isArray(actions) && actions.length > 0) {
            const actionInserts = actions.map((action: any, index: number) => ({
                workflow_id: workflow.id,
                action_order: index,
                action_type: action.action_type,
                action_config: action.action_config
            }));

            const { error: actionsError } = await supabaseAdmin
                .from('workflow_actions')
                .insert(actionInserts);

            if (actionsError) {
                console.error('[API] Error creating workflow actions:', actionsError);
                // Rollback workflow creation
                await supabaseAdmin.from('device_workflows').delete().eq('id', workflow.id);
                return NextResponse.json({ error: actionsError.message }, { status: 500 });
            }
        }

        // Fetch the complete workflow with actions
        const { data: completeWorkflow } = await supabaseAdmin
            .from('device_workflows')
            .select(`*, actions:workflow_actions(*)`)
            .eq('id', workflow.id)
            .single();

        return NextResponse.json(completeWorkflow, { status: 201 });
    } catch (error: any) {
        console.error('[API] Error in POST /workflows:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
