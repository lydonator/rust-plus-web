import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

/**
 * EXPERIMENTAL: Callback endpoint for Facepunch auth
 * This receives the redirect from Facepunch after Steam login
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session');

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing session' }, { status: 400 });
    }

    // Get the user's auth token from cookie
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=unauthorized`);
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=invalid_token`);
    }

    // At this point, we need to fetch the Facepunch success page to extract the token
    // However, we can't directly fetch it because it requires the Steam session cookies

    // ALTERNATIVE APPROACH: 
    // Since we can't easily proxy the authenticated session, we'll need to use a different method
    // For now, let's create a page that instructs the user to complete the flow manually

    return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/facepunch/complete?session=${sessionId}`
    );
}
