import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function GET(request: Request) {
    const token = request.headers.get('cookie')?.split('; ').find(row => row.startsWith('auth-token='))?.split('=')[1];

    if (!token) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const decoded = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
        return NextResponse.json({
            userId: decoded.userId,
            steamId: decoded.steamId
        });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
}
