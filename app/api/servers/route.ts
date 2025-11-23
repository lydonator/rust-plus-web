import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { ip, port, playerId, playerToken, name } = body;

    if (!ip || !port || !playerId || !playerToken) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('servers')
        .insert([{
            user_id: user.userId,
            ip,
            port: parseInt(port),
            player_id: playerId,
            player_token: playerToken,
            name: name || `${ip}:${port}`
        }])
        .select()
        .single();

    if (error) {
        console.error('Error adding server:', error);
        return NextResponse.json({ error: 'Failed to add server' }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function GET(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInfo = searchParams.get('includeInfo') === 'true';

    let query = supabaseAdmin
        .from('servers')
        .select(includeInfo ? '*, server_info(*)' : '*')
        .eq('user_id', user.userId);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function DELETE(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('id');

    if (!serverId) {
        return NextResponse.json({ error: 'Server ID required' }, { status: 400 });
    }

    // Delete server (must belong to user)
    const { error } = await supabaseAdmin
        .from('servers')
        .delete()
        .eq('id', serverId)
        .eq('user_id', user.userId);

    if (error) {
        console.error('Error deleting server:', error);
        return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 });
    }

    // Notify cloud-shim to disconnect and cleanup this server
    try {
        const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
        await fetch(`${shimUrl}/disconnect-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverId })
        });
    } catch (err) {
        console.error('Failed to notify cloud-shim of server deletion:', err);
        // Don't fail the request if notification fails
    }

    return NextResponse.json({ success: true });
}
