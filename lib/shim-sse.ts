import { SHIM_URL } from './config';

class ShimSSEManager {
    private eventSource: EventSource | null = null;
    private currentUserId: string | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private isConnecting = false;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    // Store handler references so we can remove them (Star Wars Easter Egg!)
    private handlers = {
        connected: this.handleLukeSkywalker.bind(this),
        fcm_status: this.handleHanSolo.bind(this),
        notification: this.handlePrincessLeia.bind(this),
        device_paired: this.handleChewbacca.bind(this),
        device_list_changed: this.handleJawas.bind(this),
        device_deleted: this.handleDarthVader.bind(this),
        entity: this.handleYoda.bind(this),
        connection_status: this.handleObiWan.bind(this),
        message: this.handleR2D2.bind(this),
        server_info_update: this.handleC3PO.bind(this),
        map_markers_update: this.handleBobafett.bind(this),
        team_info_update: this.handleLando.bind(this),
        team_message: this.handlePadme.bind(this),
        game_event: this.handleMaceWindu.bind(this),
        server_removed: this.handlePalpatine.bind(this),
        server_connected: this.handleQuiGon.bind(this),
        server_list_changed: this.handleAnakin.bind(this),
        inactivity_countdown: this.handleJarJar.bind(this),
        countdown_cancelled: this.handleAhsoka.bind(this),
        disconnected_by_inactivity: this.handleKyloRen.bind(this),
        shopping_list_match: this.handleGrogu.bind(this),
        error: this.handleJabba.bind(this),
    };

    // Event handlers as named methods (Star Wars themed!)
    private handleLukeSkywalker(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Connected event:', data);
    }

    private handleHanSolo(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] FCM Status:', data);
        window.dispatchEvent(new CustomEvent('fcm_status', { detail: data }));
    }

    private handlePrincessLeia(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Notification:', data);
        window.dispatchEvent(new CustomEvent('notification', { detail: data }));
    }

    private handleChewbacca(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Device Paired:', data);
        window.dispatchEvent(new CustomEvent('device_paired', { detail: data }));
    }

    private handleJawas(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Device List Changed:', data);
        window.dispatchEvent(new CustomEvent('device_list_changed', { detail: data }));
    }

    private handleDarthVader(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Device Deleted:', data);
        window.dispatchEvent(new CustomEvent('device_deleted', { detail: data }));
    }

    private handleYoda(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Entity Update:', data);
        window.dispatchEvent(new CustomEvent('rustplus_event', {
            detail: { serverId: data.serverId, type: 'entity', data }
        }));
    }

    private handleObiWan(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Connection Status:', data);
        window.dispatchEvent(new CustomEvent('rustplus_event', {
            detail: { serverId: data.serverId, type: 'connection_status', data }
        }));
    }

    private handleR2D2(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] RustPlus Message:', data);
        window.dispatchEvent(new CustomEvent('rustplus_event', {
            detail: { serverId: data.serverId, type: 'message', data }
        }));
    }

    private handleC3PO(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Server Info Update:', data);
        window.dispatchEvent(new CustomEvent('server_info_update', { detail: data }));
    }

    private handleBobafett(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Map Markers Update:', data);
        window.dispatchEvent(new CustomEvent('map_markers_update', { detail: data }));
    }

    private handleLando(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Team Info Update:', data);
        window.dispatchEvent(new CustomEvent('team_info_update', { detail: data }));
    }

    private handlePadme(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Team Message:', data);
        window.dispatchEvent(new CustomEvent('team_message', { detail: data }));
    }

    private handleMaceWindu(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Game Event:', data);
        window.dispatchEvent(new CustomEvent('game_event', { detail: data }));
    }

    private handlePalpatine(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Server Removed:', data);
        window.dispatchEvent(new CustomEvent('server_removed', { detail: data }));
    }

    private handleQuiGon(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Server Connected:', data);
        window.dispatchEvent(new CustomEvent('server_connected', { detail: data }));
    }

    private handleAnakin(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Server List Changed:', data);
        window.dispatchEvent(new CustomEvent('server_list_changed', { detail: data }));
    }

    private handleJarJar(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Inactivity Countdown:', data);
        window.dispatchEvent(new CustomEvent('inactivity_countdown', { detail: data }));
    }

    private handleAhsoka(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Countdown Cancelled:', data);
        window.dispatchEvent(new CustomEvent('countdown_cancelled', { detail: data }));
    }

    private handleKyloRen(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Disconnected By Inactivity:', data);
        window.dispatchEvent(new CustomEvent('disconnected_by_inactivity', { detail: data }));
    }

    private handleGrogu(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Shopping List Match:', data);
        window.dispatchEvent(new CustomEvent('shopping_list_match', { detail: data }));
    }

    private handleJabba(event: any) {
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
    }

    private attachEventListeners(): void {
        if (!this.eventSource) return;

        // Attach all event listeners using bound handler references
        this.eventSource.addEventListener('connected', this.handlers.connected);
        this.eventSource.addEventListener('fcm_status', this.handlers.fcm_status);
        this.eventSource.addEventListener('notification', this.handlers.notification);
        this.eventSource.addEventListener('device_paired', this.handlers.device_paired);
        this.eventSource.addEventListener('device_list_changed', this.handlers.device_list_changed);
        this.eventSource.addEventListener('device_deleted', this.handlers.device_deleted);
        this.eventSource.addEventListener('entity', this.handlers.entity);
        this.eventSource.addEventListener('connection_status', this.handlers.connection_status);
        this.eventSource.addEventListener('message', this.handlers.message);
        this.eventSource.addEventListener('server_info_update', this.handlers.server_info_update);
        this.eventSource.addEventListener('map_markers_update', this.handlers.map_markers_update);
        this.eventSource.addEventListener('team_info_update', this.handlers.team_info_update);
        this.eventSource.addEventListener('team_message', this.handlers.team_message);
        this.eventSource.addEventListener('game_event', this.handlers.game_event);
        this.eventSource.addEventListener('server_removed', this.handlers.server_removed);
        this.eventSource.addEventListener('server_connected', this.handlers.server_connected);
        this.eventSource.addEventListener('server_list_changed', this.handlers.server_list_changed);
        this.eventSource.addEventListener('inactivity_countdown', this.handlers.inactivity_countdown);
        this.eventSource.addEventListener('countdown_cancelled', this.handlers.countdown_cancelled);
        this.eventSource.addEventListener('disconnected_by_inactivity', this.handlers.disconnected_by_inactivity);
        this.eventSource.addEventListener('shopping_list_match', this.handlers.shopping_list_match);
        this.eventSource.addEventListener('error', this.handlers.error);
    }

    private removeEventListeners(): void {
        if (!this.eventSource) return;

        // Remove all event listeners using the same bound handler references
        this.eventSource.removeEventListener('connected', this.handlers.connected);
        this.eventSource.removeEventListener('fcm_status', this.handlers.fcm_status);
        this.eventSource.removeEventListener('notification', this.handlers.notification);
        this.eventSource.removeEventListener('device_paired', this.handlers.device_paired);
        this.eventSource.removeEventListener('device_list_changed', this.handlers.device_list_changed);
        this.eventSource.removeEventListener('device_deleted', this.handlers.device_deleted);
        this.eventSource.removeEventListener('entity', this.handlers.entity);
        this.eventSource.removeEventListener('connection_status', this.handlers.connection_status);
        this.eventSource.removeEventListener('message', this.handlers.message);
        this.eventSource.removeEventListener('server_info_update', this.handlers.server_info_update);
        this.eventSource.removeEventListener('map_markers_update', this.handlers.map_markers_update);
        this.eventSource.removeEventListener('team_info_update', this.handlers.team_info_update);
        this.eventSource.removeEventListener('team_message', this.handlers.team_message);
        this.eventSource.removeEventListener('game_event', this.handlers.game_event);
        this.eventSource.removeEventListener('server_removed', this.handlers.server_removed);
        this.eventSource.removeEventListener('server_connected', this.handlers.server_connected);
        this.eventSource.removeEventListener('server_list_changed', this.handlers.server_list_changed);
        this.eventSource.removeEventListener('inactivity_countdown', this.handlers.inactivity_countdown);
        this.eventSource.removeEventListener('countdown_cancelled', this.handlers.countdown_cancelled);
        this.eventSource.removeEventListener('disconnected_by_inactivity', this.handlers.disconnected_by_inactivity);
        this.eventSource.removeEventListener('shopping_list_match', this.handlers.shopping_list_match);
        this.eventSource.removeEventListener('error', this.handlers.error);
    }

    connect(userId: string): void {
        // If already connected to this user, do nothing
        if (this.currentUserId === userId && this.eventSource) {
            console.log('[ShimSSE] Already connected for user:', userId);
            return;
        }

        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            console.log('[ShimSSE] Connection already in progress, skipping');
            return;
        }

        // If switching users, disconnect old connection
        if (this.currentUserId && this.currentUserId !== userId) {
            console.log('[ShimSSE] Switching users, disconnecting old connection');
            this.disconnect();
        }

        console.log('[ShimSSE] Creating SSE connection for user:', userId);
        this.isConnecting = true;
        this.currentUserId = userId;

        // Create EventSource connection
        this.eventSource = new EventSource(`${SHIM_URL}/events/${userId}`);

        // Handle connection open
        this.eventSource.onopen = () => {
            console.log('[ShimSSE] ✅ Connected');
            this.reconnectAttempts = 0;
            this.isConnecting = false;

            // Stop heartbeat polling since we're connected
            this.stopHeartbeat();
        };

        // Handle generic messages
        this.eventSource.onmessage = (event) => {
            console.log('[ShimSSE] Message:', event);
        };

        // Attach all event listeners
        this.attachEventListeners();

        // Handle connection errors - NO RETRIES, immediate disconnect
        this.eventSource.onerror = (error) => {
            console.error('[ShimSSE] ❌ Connection error - IMMEDIATE DISCONNECT');
            console.error('[ShimSSE] EventSource readyState:', this.eventSource?.readyState);

            // Clear connecting flag
            this.isConnecting = false;

            // Close the connection but PRESERVE userId so we can reconnect on dashboard
            this.disconnect(false);

            // Start heartbeat polling to detect when shim comes back
            this.startHeartbeat();

            // Notify UI to redirect user immediately
            window.dispatchEvent(new CustomEvent('shim_connection_failed'));
        };
    }

    private startHeartbeat(): void {
        // Don't start if already running
        if (this.heartbeatInterval) {
            return;
        }

        console.log('[ShimSSE] 🔄 Starting heartbeat polling (every 3s)');

        this.heartbeatInterval = setInterval(async () => {
            try {
                const response = await fetch(`${SHIM_URL}/heartbeat`);
                if (response.ok) {
                    console.log('[ShimSSE] ✅ Shim is back online! Auto-reconnecting...');
                    this.stopHeartbeat();
                    this.reconnect();
                }
            } catch (e) {
                // Shim still offline, will retry
            }
        }, 3000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            console.log('[ShimSSE] ⏹️ Stopping heartbeat polling');
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    disconnect(clearUserId = true): void {
        console.log('[ShimSSE] Disconnecting', clearUserId ? '(clearing userId)' : '(preserving userId)');

        if (this.eventSource) {
            // Remove all event listeners before closing
            this.removeEventListeners();
            this.eventSource.close();
            this.eventSource = null;
        }

        if (clearUserId) {
            this.currentUserId = null;
            // Stop heartbeat if clearing userId (full disconnect)
            this.stopHeartbeat();
        }

        this.isConnecting = false;
    }

    isConnected(): boolean {
        return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
    }

    reconnect(): void {
        if (!this.currentUserId) {
            console.warn('[ShimSSE] Cannot reconnect - no userId stored');
            return;
        }

        console.log('[ShimSSE] Attempting to reconnect for user:', this.currentUserId);

        // Clear old connection if any (will call removeEventListeners)
        if (this.eventSource) {
            this.removeEventListeners();
            this.eventSource.close();
            this.eventSource = null;
        }

        // Force reconnect by calling connect with stored userId
        const userId = this.currentUserId;
        this.currentUserId = null; // Clear so connect() doesn't skip
        this.connect(userId);
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
