import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useServerConnection } from '@/components/ServerConnectionProvider';

/**
 * Hook to handle shim connection failures and redirect to dashboard
 * Use this in any server-specific page that depends on the shim connection
 *
 * NO RETRIES - Immediately disconnects and redirects to prevent server overload
 */
export function useShimConnectionGuard() {
    const router = useRouter();
    const { setActiveServerId } = useServerConnection();

    useEffect(() => {
        const handleShimConnectionFailed = () => {
            console.error('[ShimGuard] ❌ SHIM CONNECTION LOST - IMMEDIATE DISCONNECT');

            // Clear active server to mark it as disconnected
            setActiveServerId(null);

            // Set flag in sessionStorage to show modal on dashboard
            sessionStorage.setItem('shimDisconnected', 'true');

            // Redirect immediately to dashboard
            router.push('/dashboard');
        };

        window.addEventListener('shim_connection_failed', handleShimConnectionFailed);

        return () => {
            window.removeEventListener('shim_connection_failed', handleShimConnectionFailed);
        };
    }, [router, setActiveServerId]);
}
