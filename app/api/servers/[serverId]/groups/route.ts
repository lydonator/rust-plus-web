import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/servers/[serverId]/groups - Get all groups for a server
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string }> }
) {
    try {
        const { serverId } = await params;

        // Fetch all groups for this server with device count
        const { data: groups, error } = await supabaseAdmin
            .from('device_groups')
            .select(`
                *,
                device_count:device_group_members(count)
            `)
            .eq('server_id', serverId)
            .order('display_order', { ascending: true });

        if (error) {
            console.error('[API] Error fetching groups:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(groups || []);
    } catch (error: any) {
        console.error('[API] Error in GET /groups:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/servers/[serverId]/groups - Create a new group
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string }> }
) {
    try {
        const { serverId } = await params;
        const body = await request.json();

        const { name, color, icon } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Group name is required' },
                { status: 400 }
            );
        }

        // Get the highest display_order to append new group at the end
        const { data: maxOrder } = await supabaseAdmin
            .from('device_groups')
            .select('display_order')
            .eq('server_id', serverId)
            .order('display_order', { ascending: false })
            .limit(1)
            .single();

        const nextOrder = (maxOrder?.display_order ?? -1) + 1;

        // Create the group
        const { data: group, error } = await supabaseAdmin
            .from('device_groups')
            .insert({
                server_id: serverId,
                name: name.trim(),
                color: color || 'neutral',
                icon: icon || '📦',
                display_order: nextOrder
            })
            .select()
            .single();

        if (error) {
            console.error('[API] Error creating group:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(group, { status: 201 });
    } catch (error: any) {
        console.error('[API] Error in POST /groups:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
