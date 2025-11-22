import { SHIM_URL } from './config';

class ShimSSEManager {
    private eventSource: EventSource | null = null;
    private currentUserId: string | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    connect(userId: string): void {
        // If already connected to this user, do nothing
        if (this.currentUserId === userId && this.eventSource) {
            console.log('[ShimSSE] Already connected for user:', userId);
            return;
        }

        // If switching users, disconnect old connection
        if (this.currentUserId && this.currentUserId !== userId) {
            console.log('[ShimSSE] Switching users, disconnecting old connection');
            this.disconnect();
        }

        console.log('[ShimSSE] Creating SSE connection for user:', userId);
        this.currentUserId = userId;

        // Create EventSource connection
        this.eventSource = new EventSource(`${SHIM_URL}/events/${userId}`);

        // Handle connection open
        this.eventSource.onopen = () => {
            console.log('[ShimSSE] ✅ Connected');
            this.reconnectAttempts = 0;
        };

        // Handle generic messages
        this.eventSource.onmessage = (event) => {
            console.log('[ShimSSE] Message:', event);
        };

        // Handle specific event types
        this.eventSource.addEventListener('connected', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Connected event:', data);
        });

        this.eventSource.addEventListener('fcm_status', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] FCM Status:', data);
            window.dispatchEvent(new CustomEvent('fcm_status', { detail: data }));
        });

        this.eventSource.addEventListener('notification', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Notification:', data);
            window.dispatchEvent(new CustomEvent('notification', { detail: data }));
        });

        this.eventSource.addEventListener('device_paired', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Device Paired:', data);
            window.dispatchEvent(new CustomEvent('device_paired', { detail: data }));
        });

        this.eventSource.addEventListener('device_deleted', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Device Deleted:', data);
            window.dispatchEvent(new CustomEvent('device_deleted', { detail: data }));
        });

        this.eventSource.addEventListener('entity', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Entity Update:', data);
            window.dispatchEvent(new CustomEvent('rustplus_event', {
                detail: { serverId: data.serverId, type: 'entity', data }
            }));
        });

        this.eventSource.addEventListener('connection_status', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Connection Status:', data);
            window.dispatchEvent(new CustomEvent('rustplus_event', {
                detail: { serverId: data.serverId, type: 'connection_status', data }
            }));
        });

        this.eventSource.addEventListener('message', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] RustPlus Message:', data);
            window.dispatchEvent(new CustomEvent('rustplus_event', {
                detail: { serverId: data.serverId, type: 'message', data }
            }));
        });

        this.eventSource.addEventListener('server_info_update', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Server Info Update:', data);
            window.dispatchEvent(new CustomEvent('server_info_update', { detail: data }));
        });

        this.eventSource.addEventListener('map_markers_update', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Map Markers Update:', data);
            window.dispatchEvent(new CustomEvent('map_markers_update', { detail: data }));
        });

        this.eventSource.addEventListener('team_info_update', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Team Info Update:', data);
            window.dispatchEvent(new CustomEvent('team_info_update', { detail: data }));
        });

        this.eventSource.addEventListener('team_message', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Team Message:', data);
            window.dispatchEvent(new CustomEvent('team_message', { detail: data }));
        });

        this.eventSource.addEventListener('game_event', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Game Event:', data);
            window.dispatchEvent(new CustomEvent('game_event', { detail: data }));
        });

        this.eventSource.addEventListener('server_removed', (event: any) => {
            const data = JSON.parse(event.data);
            console.log('[ShimSSE] Server Removed:', data);
            window.dispatchEvent(new CustomEvent('server_removed', { detail: data }));
        });

        this.eventSource.addEventListener('error', (event: any) => {
            // Only try to parse if there's actual data
            if (event.data) {
                try {
                    const data = JSON.parse(event.data);
                    console.error('[ShimSSE] Error event:', data);
                    window.dispatchEvent(new CustomEvent('shim_error', { detail: data }));
                } catch (e) {
                    console.error('[ShimSSE] Failed to parse error event data:', event.data);
                }
            }
        });

        // Handle connection errors
        this.eventSource.onerror = (error) => {
            console.error('[ShimSSE] Connection error:', error);

            // Only increment on actual connection failures, not on normal close
            if (this.eventSource?.readyState === EventSource.CLOSED) {
                this.reconnectAttempts++;

                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('[ShimSSE] Max reconnect attempts reached, giving up');
                    this.disconnect();
                }
            }
        };
    }

    disconnect(): void {
        if (this.eventSource) {
            console.log('[ShimSSE] Disconnecting');
            this.eventSource.close();
            this.eventSource = null;
            this.currentUserId = null;
        }
    }

    isConnected(): boolean {
        return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
    }
}

// Singleton instance
let shimSSEInstance: ShimSSEManager | null = null;

export function getShimSSE(userId: string): ShimSSEManager {
    if (!shimSSEInstance) {
        shimSSEInstance = new ShimSSEManager();
    }
    shimSSEInstance.connect(userId);
    return shimSSEInstance;
}

// Send command via HTTP POST
export async function sendShimCommand(userId: string, serverId: string, command: string, payload: any) {
    const response = await fetch(`${SHIM_URL}/command`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userId,
            serverId,
            command,
            payload
        })
    });

    if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
    }

    return response.json();
}
