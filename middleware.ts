import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const hostname = request.headers.get('host') || '';

    // Handle status.rustplus.online subdomain
    if (hostname === 'status.rustplus.online' || hostname === 'status.localhost:3000') {
        const { pathname } = request.nextUrl;

        // Allow API routes to pass through unchanged if they are already correct
        // But if we are on status subdomain, we might want to map / to /status

        if (pathname === '/') {
            return NextResponse.rewrite(new URL('/status', request.url));
        }

        // For other paths, we might want to keep them as is (e.g. /_next/...)
        // or if the user navigates to /history, we might want /status/history
        // But for now, the status page is a single page at /status.
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
