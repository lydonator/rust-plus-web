import { SHIM_URL } from './config';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

class ShimSSEManager {
    private eventSource: EventSource | null = null;
    private currentUserId: string | null = null;
    private token: string | null = null;
    private connectionState: ConnectionState = 'idle';
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10; // Cap at 10 attempts (~15 mins with backoff)
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connectingTimeout: ReturnType<typeof setTimeout> | null = null;
    
    private isConnecting = false; // Deprecated in favor of connectionState, but keeping for safety

    // Store handler references so we can remove them (Star Wars Easter Egg!)
    private handlers = {
        connected: this.handleLukeSkywalker.bind(this),
        heartbeat: this.handleBB8.bind(this),
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
        dynamic_markers_update: this.handleGroguMoving.bind(this),
        static_markers_update: this.handleMandalorianStatic.bind(this),
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
        console.log('[ShimSSE] ✅ Connected');
        this.connectionState = 'connected';
        
        // Clear any active servers when shim reconnects (after being down)
        // This forces users to manually reconnect, avoiding complex state management
        console.log('[ShimSSE] Clearing active servers on shim reconnection');
        window.dispatchEvent(new CustomEvent('shim_reconnected_clear_servers'));
        window.dispatchEvent(new CustomEvent('shim_connected'));
    }

    private handleBB8(event: any) {
        // Heartbeat received - connection is alive (now handled by activity tracker)
        // console.log('[ShimSSE] Heartbeat (BB-8) received');
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
        console.log('[ShimSSE] Dispatching connection_status event for server:', data.serverId);
        window.dispatchEvent(new CustomEvent('rustplus_event', {
            detail: { serverId: data.serverId, type: 'connection_status', data }
        }));
        console.log('[ShimSSE] connection_status event dispatched');
    }

    private handleR2D2(event: any) {
        const data = JSON.parse(event.data);
        // Only log non-empty messages to reduce console noise
        if (data && Object.keys(data).length > 2) { // More than just serverId and type
            console.log('[ShimSSE] RustPlus Message:', data);
        }
        window.dispatchEvent(new CustomEvent('rustplus_event', {
            detail: { serverId: data.serverId, type: 'message', data }
        }));
    }

    private handleC3PO(event: any) {
        const data = JSON.parse(event.data);
        // Reduce server info logging frequency to avoid spam
        // console.log('[ShimSSE] Server Info Update:', data);
        window.dispatchEvent(new CustomEvent('server_info_update', { detail: data }));
    }

    private handleBobafett(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Map Markers Update:', data);
        window.dispatchEvent(new CustomEvent('map_markers_update', { detail: data }));
    }

    private handleGroguMoving(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Dynamic Markers Update:', data);
        window.dispatchEvent(new CustomEvent('dynamic_markers_update', { detail: data }));
    }

    private handleMandalorianStatic(event: any) {
        const data = JSON.parse(event.data);
        console.log('[ShimSSE] Static Markers Update:', data);
        window.dispatchEvent(new CustomEvent('static_markers_update', { detail: data }));
    }

    private handleLando(event: any) {
        const data = JSON.parse(event.data);
        // Reduce team info logging frequency to avoid spam
        // console.log('[ShimSSE] Team Info Update:', data);
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
        this.eventSource.addEventListener('heartbeat', this.handlers.heartbeat);
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
        this.eventSource.addEventListener('dynamic_markers_update', this.handlers.dynamic_markers_update);
        this.eventSource.addEventListener('static_markers_update', this.handlers.static_markers_update);
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
        this.eventSource.removeEventListener('heartbeat', this.handlers.heartbeat);
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
        this.eventSource.removeEventListener('dynamic_markers_update', this.handlers.dynamic_markers_update);
        this.eventSource.removeEventListener('static_markers_update', this.handlers.static_markers_update);
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

    private updateState(newState: ConnectionState): void {
        if (this.connectionState !== newState) {
            this.connectionState = newState;
            console.log(`[ShimSSE] State changed: ${newState}`);
            window.dispatchEvent(new CustomEvent('shim_connection_state_changed', { detail: { state: newState } }));
        }
    }

    getState(): ConnectionState {
        return this.connectionState;
    }

    private attemptReconnect(): void {
        if (this.connectionState === 'offline') return;

        this.updateState('reconnecting');

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[ShimSSE] Max reconnect attempts reached. Giving up.');
            this.updateState('offline');
            window.dispatchEvent(new CustomEvent('shim_connection_failed'));
            return;
        }

        // For stuck connections, try immediate reconnect first time
        const delay = this.reconnectAttempts === 0 ? 1000 : Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
        console.log(`[ShimSSE] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.reconnect();
        }, delay);
    }

    connect(userId: string, token?: string): void {
        if (token) this.token = token;

        // If already connected to this user, do nothing
        if (this.currentUserId === userId && this.connectionState === 'connected' && this.eventSource) {
            console.log('[ShimSSE] Already connected for user:', userId);
            this.setupHeartbeatReconnectListener(); // Ensure listener is active
            return;
        }

        // If switching users, disconnect old connection
        if (this.currentUserId && this.currentUserId !== userId) {
            console.log('[ShimSSE] Switching users, disconnecting old connection');
            this.disconnect(true); // Clear old user state
        }

        // Cancel any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Set up heartbeat failure listener
        this.setupHeartbeatReconnectListener();

        console.log('[ShimSSE] Creating SSE connection for user:', userId);
        this.updateState('connecting');
        this.currentUserId = userId;
        this.isConnecting = true; // Legacy flag

        // Set up connection timeout to catch stuck connections
        this.connectingTimeout = setTimeout(() => {
            if (this.connectionState === 'connecting') {
                console.error('[ShimSSE] Connection stuck in connecting state - forcing reconnect');
                this.eventSource?.close();
                this.eventSource = null;
                this.connectingTimeout = null;
                this.attemptReconnect();
            }
        }, 10000); // 10 second timeout for stuck connections

        // Create EventSource connection
        const url = this.token 
            ? `${SHIM_URL}/events/${userId}?token=${this.token}`
            : `${SHIM_URL}/events/${userId}`; // Fallback for legacy/dev
            
        console.log('[ShimSSE] Connecting to:', url);
        this.eventSource = new EventSource(url);

        // Handle connection open
        this.eventSource.onopen = () => {
            console.log('[ShimSSE] ✅ Connected');
            this.updateState('connected');
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            
            // Clear connecting timeout
            if (this.connectingTimeout) {
                clearTimeout(this.connectingTimeout);
                this.connectingTimeout = null;
            }
        };

        // Handle generic messages  
        this.eventSource.onmessage = (event) => {
            // console.log('[ShimSSE] Message:', event);
        };

        // Attach all event listeners
        this.attachEventListeners();

        // Handle connection errors with retry logic
        this.eventSource.onerror = (error) => {
            console.error('[ShimSSE] ❌ Connection error', error);
            console.log('[ShimSSE] EventSource readyState:', this.eventSource?.readyState);
            
            // Clear connecting timeout
            if (this.connectingTimeout) {
                clearTimeout(this.connectingTimeout);
                this.connectingTimeout = null;
            }
            
            // Clean up current source
            this.eventSource?.close();
            this.eventSource = null;
            this.isConnecting = false;

            // Attempt recovery
            this.attemptReconnect();
        };
    }

    // Simplified - heartbeat in activity tracker handles connection health
    private heartbeatReconnectListener: ((event: Event) => void) | null = null;
    
    private setupHeartbeatReconnectListener(): void {
        // Remove existing listener if any
        if (this.heartbeatReconnectListener) {
            window.removeEventListener('heartbeat_failure_reconnect', this.heartbeatReconnectListener);
        }
        
        // Create new listener
        this.heartbeatReconnectListener = () => {
            console.log('[ShimSSE] Heartbeat failure detected - forcing reconnect');
            this.reconnect();
        };
        
        window.addEventListener('heartbeat_failure_reconnect', this.heartbeatReconnectListener);
    }

    disconnect(clearUserId = true): void {
        console.log('[ShimSSE] Disconnecting', clearUserId ? '(clearing userId)' : '(preserving userId)');

        // Clear connecting timeout
        if (this.connectingTimeout) {
            clearTimeout(this.connectingTimeout);
            this.connectingTimeout = null;
        }

        // Remove heartbeat reconnect listener
        if (this.heartbeatReconnectListener) {
            window.removeEventListener('heartbeat_failure_reconnect', this.heartbeatReconnectListener);
            this.heartbeatReconnectListener = null;
        }

        if (this.eventSource) {
            // Remove all event listeners before closing
            this.removeEventListeners();
            this.eventSource.close();
            this.eventSource = null;
        }

        if (clearUserId) {
            this.currentUserId = null;
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
        const token = this.token || undefined;
        this.currentUserId = null; // Clear so connect() doesn't skip
        this.connect(userId, token);
    }
}

// Singleton instance
let shimSSEInstance: ShimSSEManager | null = null;

export function getShimSSE(userId: string, token?: string): ShimSSEManager {
    if (!shimSSEInstance) {
        shimSSEInstance = new ShimSSEManager();
    }
    shimSSEInstance.connect(userId, token);
    return shimSSEInstance;
}

// Send command via HTTP POST
export async function sendShimCommand(userId: string, serverId: string, command: string, payload: any, token?: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${SHIM_URL}/command`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            userId,
            serverId,
            command,
            payload
        })
    });

    if (!response.ok) {
        // Enhanced error handling for different status codes
        if (response.status === 503) {
            throw new Error('Server not connected. Please wait for the connection to establish and try again.');
        } else if (response.status === 429) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Rate limit exceeded. Please wait before trying again.${errorData.retryAfter ? ` Retry after: ${new Date(errorData.retryAfter).toLocaleTimeString()}` : ''}`);
        } else if (response.status === 403) {
            throw new Error('Unauthorized access to this server.');
        } else if (response.status === 400) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Invalid request: ${errorData.error || response.statusText}`);
        } else if (response.status >= 500) {
            throw new Error(`Server error (${response.status}). Please try again in a moment.`);
        } else {
            throw new Error(`Command failed: ${response.statusText}`);
        }
    }

    return response.json();
}
