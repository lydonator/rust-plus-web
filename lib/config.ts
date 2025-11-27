// Cloud Shim URL - defaults to production, falls back to localhost in development
export const SHIM_URL = process.env.NEXT_PUBLIC_SHIM_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : 'https://shim.rustplus.online');
