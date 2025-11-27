import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // Redirect to Facepunch companion login
    // After Steam login, Facepunch will redirect back to our callback with the Rust+ auth token
    const returnUrl = `${process.env.STEAM_REALM}/api/auth/callback`;
    const facepunchLoginUrl = `https://companion-rust.facepunch.com/login?returnUrl=${encodeURIComponent(returnUrl)}`;

    return NextResponse.redirect(facepunchLoginUrl);
}
