import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    // Get auth token from cookie
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized - Please log in to your web app first' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { ip, port, playerId, playerToken, name, desc, img, logo, url } = body;

    if (!ip || !port || !playerId || !playerToken) {
        return NextResponse.json({ error: 'Missing required fields: ip, port, playerId, playerToken' }, { status: 400 });
    }

    // Check if server already exists for this user
    const { data: existingServer } = await supabaseAdmin
        .from('servers')
        .select('*')
        .eq('user_id', user.userId)
        .eq('ip', ip)
        .eq('port', parseInt(port))
        .single();

    if (existingServer) {
        // Update existing server with new token
        const { data, error } = await supabaseAdmin
            .from('servers')
            .update({
                player_id: playerId,
                player_token: playerToken,
                name: name || `${ip}:${port}`
            })
            .eq('id', existingServer.id)
            .select()
            .single();

        if (error) {
            console.error('Error updating server:', error);
            return NextResponse.json({ error: 'Failed to update server' }, { status: 500 });
        }

        return NextResponse.json({ message: 'Server updated', server: data });
    }

    // Create new server
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

    return NextResponse.json({ message: 'Server paired successfully', server: data });
}
