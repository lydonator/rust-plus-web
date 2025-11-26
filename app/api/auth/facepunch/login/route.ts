import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * EXPERIMENTAL: Alternative Facepunch login flow
 * This is a NEW flow that doesn't interfere with existing extension-based auth
 */
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

    // Store the user's ID in a temporary session to retrieve after callback
    // We'll use a simple in-memory store for now (in production, use Redis or database)
    const sessionId = crypto.randomUUID();

    // TODO: Store sessionId -> userId mapping (for now, we'll use a query param)

    // Redirect to Facepunch Steam login
    // Note: We need to figure out the exact OAuth flow Facepunch uses
    const redirectUrl = `https://companion-rust.facepunch.com/login?returnUrl=${encodeURIComponent(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facepunch/callback?session=${sessionId}`
    )}`;

    return NextResponse.redirect(redirectUrl);
}
