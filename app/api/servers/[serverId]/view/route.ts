import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> }
) {
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

    const { serverId } = await params;

    // Update last_viewed_at timestamp
    const { error } = await supabaseAdmin
        .from('servers')
        .update({ last_viewed_at: new Date().toISOString() })
        .eq('id', serverId)
        .eq('user_id', user.userId);

    if (error) {
        console.error('Error updating last_viewed_at:', error);
        return NextResponse.json({ error: 'Failed to update view timestamp' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
