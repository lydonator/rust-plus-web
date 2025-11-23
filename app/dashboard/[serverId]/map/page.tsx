'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Info, MapPin, Users, Plus, Minus, RotateCcw, ShoppingCart, Grid3X3, Skull } from 'lucide-react';
import { useShim } from '@/hooks/useShim';
import rustItems from '@/lib/rust-items.json';

interface Monument {
    token: string;
    x: number;
    y: number;
}

interface MapData {
    jpgImage: string;
    width: number;
    height: number;
    oceanMargin: number;
    monuments?: Monument[];
    background?: string;
}

interface MapMarker {
    id: number;
    type: number | string;
    x: number;
    y: number;
    name?: string;
    sellOrders?: any[];
}

interface TeamMember {
    steamId: string;
    name: string;
    x: number;
    y: number;
    isOnline: boolean;
    spawnTime: number;
    isAlive: boolean;
    deathTime: number;
}

interface ServerInfo {
    name: string;
    map: string;
    mapSize: number;
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
}

interface RustItem {
    name: string;
    shortname: string;
    iconUrl: string;
}

type RustItemsDatabase = Record<string, RustItem>;

export default function MapPage() {
    const params = useParams();
    const serverId = params.serverId as string;
    const [userId, setUserId] = useState<string | null>(null);

    const [mapData, setMapData] = useState<MapData | null>(null);
    const [markers, setMarkers] = useState<MapMarker[]>([]);
    const [teamInfo, setTeamInfo] = useState<TeamMember[]>([]);
    const [deathLocations, setDeathLocations] = useState<Record<string, { x: number, y: number }>>({});
    const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showMarkers, setShowMarkers] = useState(true);
    const [showTeam, setShowTeam] = useState(true);
    const [showMonuments, setShowMonuments] = useState(true);
    const [showTrainTunnels, setShowTrainTunnels] = useState(false);
    const [showGrid, setShowGrid] = useState(false);



    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredMarkerIndex, setHoveredMarkerIndex] = useState<number | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastDeathTimeRef = useRef<Record<string, number>>({});


    const handleMarkerEnter = (index: number) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setHoveredMarkerIndex(index);
    };

    const handleMarkerLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredMarkerIndex(null);
        }, 300);
    };

    const itemsDb = rustItems as RustItemsDatabase;

    const { sendCommand } = useShim(userId);

    // Get user ID
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUserId(userData.userId);
            });
    }, []);

    // Fetch all map data
    const fetchMapData = async () => {
        if (!userId) return;

        setLoading(true);
        setError(null);

        try {
            const mapResult = await sendCommand(serverId, 'getMap', {});
            if (mapResult.success) {
                setMapData(mapResult.data);
            }

            const markersResult = await sendCommand(serverId, 'getMapMarkers', {});
            if (markersResult.success) {
                setMarkers(markersResult.data.markers || []);
            }

            const teamResult = await sendCommand(serverId, 'getTeamInfo', {});
            if (teamResult.success) {
                setTeamInfo(teamResult.data.members || []);
            }

            const infoResult = await sendCommand(serverId, 'getServerInfo', {});
            if (infoResult.success) {
                setServerInfo(infoResult.data);
            }

        } catch (err: any) {
            console.error('Error fetching map data:', err);
            setError(err.message || 'Failed to fetch map data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (userId) {
            fetchMapData();
        }
    }, [userId, serverId]);

    // Listen for real-time map markers updates via SSE
    useEffect(() => {
        if (!userId) return;

        const handleMapMarkersUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: eventServerId, markers: newMarkers } = customEvent.detail;

            if (eventServerId !== serverId) return;

            console.log('[Map] 📍 Received map markers update via SSE');
            setMarkers(newMarkers || []);
        };

        window.addEventListener('map_markers_update', handleMapMarkersUpdate);

        return () => {
            window.removeEventListener('map_markers_update', handleMapMarkersUpdate);
        };
    }, [userId, serverId]);

    // Listen for real-time team info updates via SSE
    useEffect(() => {
        if (!userId) return;

        const handleTeamInfoUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            console.log('[Map] 👥 Full event detail:', customEvent.detail);
            const { serverId: eventServerId, members } = customEvent.detail;

            if (eventServerId !== serverId) return;

            console.log('[Map] 👥 Received team info update via SSE');
            console.log('[Map] 👥 Members data:', members);
            console.log('[Map] 👥 Members count:', members?.length);

            // Deduplicate members by steamId (game server sometimes returns duplicates)
            const uniqueMembers = members ? Array.from(
                new Map(members.map((m: TeamMember) => [m.steamId, m])).values()
            ) as TeamMember[] : [];

            console.log('[Map] 👥 Unique members count:', uniqueMembers.length);
            setTeamInfo(uniqueMembers);
        };

        window.addEventListener('team_info_update', handleTeamInfoUpdate);

        return () => {
            window.removeEventListener('team_info_update', handleTeamInfoUpdate);
        };
    }, [userId, serverId]);

    useEffect(() => {
        if (!userId) return;

        const handleServerInfoUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: eventServerId, ...data } = customEvent.detail;

            if (eventServerId !== serverId) return;

            console.log('[Map] 📡 Received server info update via SSE');
            setServerInfo(data);
        };

        window.addEventListener('server_info_update', handleServerInfoUpdate);

        return () => {
            window.removeEventListener('server_info_update', handleServerInfoUpdate);
        };
    }, [userId, serverId]);

    // Track death locations (simplified: always update if dead)
    useEffect(() => {
        setDeathLocations(prev => {
            const newLocations = { ...prev };
            let changed = false;

            teamInfo.forEach(member => {
                // If player is dead, their current location is their death location.
                // We keep updating it as long as they are dead (in case of corpse movement or initial bad data).
                // When they respawn (isAlive becomes true), we stop updating, preserving the last death location.
                if (!member.isAlive) {
                    const currentLoc = newLocations[member.steamId];

                    // Update if we don't have a location, or if it changed
                    if (!currentLoc || currentLoc.x !== member.x || currentLoc.y !== member.y) {
                        newLocations[member.steamId] = { x: member.x, y: member.y };
                        changed = true;
                    }
                }
            });

            return changed ? newLocations : prev;
        });
    }, [teamInfo]);


    // Helper to get item info from database
    const getItemInfo = (itemId: number): RustItem | null => {
        const item = itemsDb[itemId.toString()];
        return item || null;
    };

    // Helper to convert monument tokens to proper display names
    const getMonumentDisplayName = (token: string): string => {
        const nameMap: Record<string, string> = {
            'large_oil_rig': 'Large Oil Rig',
            'oil_rig_small': 'Oil Rig',
            'launchsite': 'Launch Site',
            'military_tunnels_display_name': 'Military Tunnels',
            'AbandonedMilitaryBase': 'Military Base',
            'airfield_display_name': 'Airfield',
            'power_plant_display_name': 'Power Plant',
            'train_yard_display_name': 'Train Yard',
            'water_treatment_plant_display_name': 'Water Treatment',
            'dome_monument_name': 'The Dome',
            'satellite_dish_display_name': 'Satellite Dish',
            'junkyard_display_name': 'Junkyard',
            'harbor_display_name': 'Harbor',
            'harbor_2_display_name': 'Large Harbor',
            'outpost': 'Outpost',
            'bandit_camp': 'Bandit Camp',
            'excavator': 'Giant Excavator',
            'lighthouse_display_name': 'Lighthouse',
            'mining_outpost_display_name': 'Mining Outpost',
            'underwater_lab': 'Underwater Labs',
            'arctic_base_a': 'Arctic Research Base',
            'missile_silo_monument': 'Missile Silo',
            'train_tunnel_display_name': 'Train Tunnel',
            'train_tunnel_link_display_name': 'Train Tunnel',
            'sewer_display_name': 'Sewer Branch',
            'mining_quarry_hqm_display_name': 'HQM Quarry',
            'mining_quarry_sulfur_display_name': 'Sulfur Quarry',
            'mining_quarry_stone_display_name': 'Stone Quarry',
            'large_fishing_village_display_name': 'Large Fishing Village',
            'fishing_village_display_name': 'Fishing Village',
            'ferryterminal': 'Ferry Terminal',
            'stables_a': 'Ranch',
            'swamp_c': 'Abandoned Cabins',
            'supermarket': 'Supermarket',
            'gas_station': "Oxum's Gas Station",
        };

        // Check if we have a direct mapping
        if (nameMap[token]) {
            return nameMap[token];
        }

        // Handle full asset paths like "assets/bundled/prefabs/autospawn/monument/underwater_lab/underwater_lab_a.prefab"
        if (token.includes('/')) {
            // Extract the monument folder name (e.g., "underwater_lab" from the path)
            const parts = token.split('/');
            const monumentFolder = parts[parts.length - 2]; // Get the folder name before the file

            // Check if the folder name is in our mapping
            if (nameMap[monumentFolder]) {
                return nameMap[monumentFolder];
            }

            // Otherwise clean up the folder name
            return monumentFolder
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .trim();
        }

        // Fallback: clean up the token
        return token.replace(/_/g, ' ').replace(/display name/gi, '').trim();
    };

    const gameToScreen = (x: number, y: number) => {
        if (!mapData || !serverInfo) return { x: 0, y: 0 };

        const margin = 1000; // Fixed ocean margin
        const mapSize = serverInfo.mapSize;
        const worldSize = mapSize + (margin * 2);
        const scaleFactor = mapData.width / worldSize;

        const xOffset = x + (mapSize / 2) + margin;
        const yOffset = y + (mapSize / 2) + margin;

        const xScreen = xOffset * scaleFactor;
        const yScreen = (worldSize - yOffset) * scaleFactor;

        return { x: xScreen, y: yScreen };
    };

    const monumentToScreen = (x: number, y: number) => {
        if (!mapData || !serverInfo) return { x: 0, y: 0 };

        const margin = 1000; // Fixed ocean margin
        const mapSize = serverInfo.mapSize;
        const worldSize = mapSize + (margin * 2);
        const scaleFactor = mapData.width / worldSize;

        const xOffset = x + margin;
        const yOffset = y + margin;

        const xScreen = xOffset * scaleFactor;
        const yScreen = (worldSize - yOffset) * scaleFactor;

        return { x: xScreen, y: yScreen };
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;

        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.5, scale + delta), 8);

        // Calculate mouse position relative to the container center
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        // Calculate the ratio of change
        const ratio = newScale / scale;

        // Adjust position to keep the point under the mouse stationary
        // Formula: newPos = mousePos - (mousePos - oldPos) * ratio
        const newPosition = {
            x: mouseX - (mouseX - position.x) * ratio,
            y: mouseY - (mouseY - position.y) * ratio
        };

        setScale(newScale);
        setPosition(newPosition);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const resetView = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const getMarkerTypeName = (type: number | string) => {
        if (typeof type === 'string') return type;

        const types: { [key: number]: string } = {
            1: 'Player',
            2: 'Explosion',
            3: 'Vending Machine',
            4: 'CH47',
            5: 'Cargo Ship',
            6: 'Crate',
            7: 'Generic Radius',
            8: 'Patrol Helicopter'
        };
        return types[type] || `Unknown (${type})`;
    };

    const getMarkerColor = (type: number | string) => {
        if (typeof type === 'string') {
            const typeStr = type.toLowerCase();
            if (typeStr.includes('player')) return '#3b82f6';
            if (typeStr.includes('explosion')) return '#ef4444';
            if (typeStr.includes('vending')) return '#10b981';
            if (typeStr.includes('ch47') || typeStr.includes('chinook')) return '#f59e0b';
            if (typeStr.includes('cargo')) return '#8b5cf6';
            if (typeStr.includes('crate')) return '#f59e0b';
            if (typeStr.includes('radius')) return '#6b7280';
            if (typeStr.includes('heli') || typeStr.includes('patrol')) return '#dc2626';
            return '#6b7280';
        }

        const colors: { [key: number]: string } = {
            1: '#3b82f6',
            2: '#ef4444',
            3: '#10b981',
            4: '#f59e0b',
            5: '#8b5cf6',
            6: '#f59e0b',
            7: '#6b7280',
            8: '#dc2626'
        };
        return colors[type] || '#6b7280';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-neutral-950">
                <div className="text-white">Loading map data...</div>
            </div>
        );
    }

    if (error || !mapData || !serverInfo) {
        return (
            <div className="flex items-center justify-center h-screen bg-neutral-950">
                <div className="text-red-400">{error || 'Failed to load map data'}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-950 p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        Server Map
                        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">v2.6</span>
                    </h1>
                    {serverInfo && (
                        <p className="text-neutral-400">
                            {serverInfo.map} ({serverInfo.mapSize}m) - {serverInfo.players}/{serverInfo.maxPlayers} players
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowMonuments(!showMonuments)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showMonuments
                            ? 'bg-purple-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                            }`}
                    >
                        <Info className="w-4 h-4" />
                        <span>Monuments</span>
                    </button>
                    <button
                        onClick={() => setShowMarkers(!showMarkers)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showMarkers
                            ? 'bg-green-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                            }`}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        <span>Shops ({markers.length})</span>
                    </button>
                    <button
                        onClick={() => setShowTeam(!showTeam)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showTeam
                            ? 'bg-blue-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        <span>Team ({teamInfo.length})</span>
                    </button>
                    <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showGrid
                            ? 'bg-purple-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                            }`}
                    >
                        <Grid3X3 className="w-4 h-4" />
                        <span>Grid</span>
                    </button>
                    <button
                        onClick={() => setShowTrainTunnels(!showTrainTunnels)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showTrainTunnels
                            ? 'bg-orange-600 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                            }`}
                    >
                        <span>🚇</span>
                        <span>Train Tunnels</span>
                    </button>
                </div>
            </div>



            <div className="flex-1 bg-neutral-900 rounded-lg overflow-hidden relative">
                <div className="absolute z-20 top-4 right-4 flex flex-col gap-2 bg-neutral-800/80 backdrop-blur p-2 rounded-lg shadow-lg">
                    <button
                        onClick={() => setScale(s => Math.min(s + 0.5, 8))}
                        className="p-2 text-white hover:bg-neutral-700 rounded transition-colors"
                        title="Zoom In"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}
                        className="p-2 text-white hover:bg-neutral-700 rounded transition-colors"
                        title="Zoom Out"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={resetView}
                        className="p-2 text-white hover:bg-neutral-700 rounded transition-colors"
                        title="Reset View"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>

                <div
                    ref={containerRef}
                    className="w-full h-full cursor-move overflow-hidden"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                            transformOrigin: 'center',
                            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <div className="relative" style={{ width: '100%', height: '100%' }}>
                            <img
                                src={`data:image/jpeg;base64,${mapData.jpgImage}`}
                                alt="Server Map"
                                className="w-full h-full object-contain pointer-events-none select-none"
                                draggable={false}
                            />

                            <svg
                                className="absolute inset-0 w-full h-full"
                                viewBox={`0 0 ${mapData.width} ${mapData.height}`}
                                preserveAspectRatio="xMidYMid meet"
                                style={{ pointerEvents: 'none' }}
                            >
                                {/* Grid */}
                                {showGrid && serverInfo && (() => {
                                    const p0 = monumentToScreen(0, 0);
                                    const p1 = monumentToScreen(1, 0);
                                    const cellSize = p1.x - p0.x;
                                    const fontSize = cellSize * 0.15;

                                    const center = serverInfo.mapSize / 2;
                                    // Manual offset to match in-game grid (approx 1/4 cell)
                                    // Visually adjusted: Left (-X) and Down (-Y)
                                    const GRID_OFFSET_X = -36.6;
                                    const GRID_OFFSET_Y = -36.6;

                                    const kMinX = Math.floor(-(center + GRID_OFFSET_X) / 146.3);
                                    const kMaxX = Math.ceil((serverInfo.mapSize - center - GRID_OFFSET_X) / 146.3);
                                    const kMinY = Math.floor(-(center + GRID_OFFSET_Y) / 146.3);
                                    const kMaxY = Math.ceil((serverInfo.mapSize - center - GRID_OFFSET_Y) / 146.3);

                                    const elements = [];

                                    // Vertical Lines
                                    for (let k = kMinX; k <= kMaxX; k++) {
                                        const x = center + k * 146.3 + GRID_OFFSET_X;
                                        if (x < 0 || x > serverInfo.mapSize) continue;
                                        const start = monumentToScreen(x, 0);
                                        const end = monumentToScreen(x, serverInfo.mapSize);
                                        elements.push(
                                            <line
                                                key={`v-${k}`}
                                                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                                                stroke="black" strokeWidth={1 / scale}
                                            />
                                        );
                                    }

                                    // Horizontal Lines
                                    for (let k = kMinY; k <= kMaxY; k++) {
                                        const y = center + k * 146.3 + GRID_OFFSET_Y;
                                        if (y < 0 || y > serverInfo.mapSize) continue;
                                        const start = monumentToScreen(0, y);
                                        const end = monumentToScreen(serverInfo.mapSize, y);
                                        elements.push(
                                            <line
                                                key={`h-${k}`}
                                                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                                                stroke="black" strokeWidth={1 / scale}
                                            />
                                        );
                                    }

                                    // Labels
                                    const kStartRow = Math.floor((serverInfo.mapSize - center - GRID_OFFSET_Y) / 146.3) - 1;
                                    const kStartCol = Math.floor(-(center + GRID_OFFSET_X) / 146.3) + 1;

                                    for (let kY = kStartRow; kY >= kMinY; kY--) {
                                        const rowIdx = kStartRow - kY;
                                        const yTop = center + (kY + 1) * 146.3 + GRID_OFFSET_Y;

                                        if (yTop <= 0 || yTop > serverInfo.mapSize + 146.3) continue;

                                        for (let kX = kStartCol; kX <= kMaxX; kX++) {
                                            const colIdx = kX - kStartCol;
                                            const xLeft = center + kX * 146.3 + GRID_OFFSET_X;

                                            if (xLeft >= serverInfo.mapSize || xLeft < -146.3) continue;

                                            const pos = monumentToScreen(xLeft, yTop);

                                            let colLabel = '';
                                            if (colIdx < 26) colLabel = String.fromCharCode(65 + colIdx);
                                            else colLabel = 'A' + String.fromCharCode(65 + (colIdx - 26));

                                            const label = `${colLabel}${rowIdx}`;

                                            elements.push(
                                                <text
                                                    key={`cell-${kX}-${kY}`}
                                                    x={pos.x + (fontSize * 0.2)}
                                                    y={pos.y + fontSize}
                                                    fontSize={fontSize}
                                                    fill="rgba(255, 255, 255, 0.5)"
                                                    fontWeight="bold"
                                                    className="select-none"
                                                >
                                                    {label}
                                                </text>
                                            );
                                        }
                                    }

                                    return <g className="pointer-events-none opacity-60">{elements}</g>;
                                })()}

                                {/* Monuments */}
                                {showMonuments && mapData.monuments && mapData.monuments.map((monument, idx) => {
                                    const pos = monumentToScreen(monument.x, monument.y);
                                    const displayName = getMonumentDisplayName(monument.token);
                                    const fontSize = Math.max(24, 36 / scale);

                                    // Filter out train tunnels if toggle is off
                                    const isTrainTunnel = monument.token.toLowerCase().includes('train_tunnel') ||
                                        monument.token.toLowerCase().includes('traintunnel');
                                    if (isTrainTunnel && !showTrainTunnels) {
                                        return null;
                                    }

                                    return (
                                        <g key={`monument-${idx}`}>
                                            {/* Background shadow layer for depth */}
                                            <text
                                                x={pos.x + 2}
                                                y={pos.y + 2}
                                                fill="rgba(0,0,0,0.7)"
                                                fontSize={fontSize}
                                                fontWeight="900"
                                                fontFamily="Arial, sans-serif"
                                                textAnchor="middle"
                                                className="pointer-events-none select-none"
                                            >
                                                {displayName}
                                            </text>
                                            {/* Main text with outline */}
                                            <text
                                                x={pos.x}
                                                y={pos.y}
                                                fill="white"
                                                fontSize={fontSize}
                                                fontWeight="900"
                                                fontFamily="Arial, sans-serif"
                                                textAnchor="middle"
                                                className="pointer-events-none select-none"
                                                style={{
                                                    filter: 'drop-shadow(1px 1px 2px rgba(0,0,0,0.9))',
                                                    stroke: 'rgba(0,0,0,0.8)',
                                                    strokeWidth: '1.5px',
                                                    paintOrder: 'stroke fill'
                                                }}
                                            >
                                                {displayName}
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Map Markers */}
                                {showMarkers && markers.map((marker, idx) => {
                                    // Skip player markers as they are handled by the teamInfo loop
                                    if (marker.type === 1 || marker.type === 'Player') return null;

                                    const pos = monumentToScreen(marker.x, marker.y);
                                    const baseRadius = Math.max(4, 8 / scale);
                                    const isVending = marker.type === 3 || marker.type === 'VendingMachine';
                                    // Increase vending machine size by 50%
                                    const radius = isVending ? baseRadius * 1.5 : baseRadius;
                                    const stroke = Math.max(1, 2 / scale);
                                    const isHovered = hoveredMarkerIndex === idx;

                                    // Empty shops (no sellOrders) show as orange, like in-game
                                    const hasItems = marker.sellOrders && marker.sellOrders.length > 0;
                                    const markerColor = isVending
                                        ? (hasItems ? '#10b981' : '#d97706') // Green if has items, Darker orange if empty
                                        : getMarkerColor(marker.type);

                                    return (
                                        <g
                                            key={`marker-${idx}`}
                                            className="group"
                                            style={{ pointerEvents: 'auto' }}
                                            onMouseEnter={() => handleMarkerEnter(idx)}
                                            onMouseLeave={handleMarkerLeave}
                                        >
                                            <circle
                                                cx={pos.x}
                                                cy={pos.y}
                                                r={radius}
                                                fill={markerColor}
                                                stroke={isVending ? "black" : "white"}
                                                strokeWidth={stroke}
                                                className="drop-shadow-lg cursor-pointer transition-all"
                                            />
                                            {/* Shopping cart icon for vending machines */}
                                            {isVending && (
                                                <g transform={`translate(${pos.x}, ${pos.y})`}>
                                                    <path
                                                        d="M -2.5 -1.5 L -1.5 -1.5 L -0.5 1.5 L 2 1.5 M 0 1.5 L 0.5 -0.5 L 2.5 -0.5 M 0.3 2.2 A 0.3 0.3 0 1 1 0.3 2.21 M 1.8 2.2 A 0.3 0.3 0 1 1 1.8 2.21"
                                                        stroke="black"
                                                        strokeWidth={0.4}
                                                        fill="none"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        transform={`scale(${1 / scale})`}
                                                    />
                                                </g>
                                            )}
                                            {isVending && marker.sellOrders && marker.sellOrders.length > 0 && isHovered && (
                                                <foreignObject
                                                    x={pos.x + 10}
                                                    y={pos.y - 80}
                                                    width="280"
                                                    height="300"
                                                    className="overflow-visible pointer-events-auto"
                                                    onMouseEnter={() => handleMarkerEnter(idx)}
                                                    onMouseLeave={handleMarkerLeave}
                                                >
                                                    <div className="bg-neutral-900/95 text-white p-3 rounded-lg text-xs border border-neutral-600 shadow-2xl">
                                                        <div className="font-bold mb-2 pb-2 border-b border-neutral-600 text-sm text-green-400">
                                                            {marker.name || 'A Shop'}
                                                        </div>
                                                        {marker.sellOrders.slice(0, 5).map((order: any, i: number) => {
                                                            const sellingItem = getItemInfo(order.itemId);
                                                            const costItem = getItemInfo(order.currencyId);

                                                            return (
                                                                <div key={i} className="mb-2 pb-2 border-b border-neutral-700 last:border-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        {sellingItem?.iconUrl && (
                                                                            <img src={sellingItem.iconUrl} alt="" className="w-8 h-8" />
                                                                        )}
                                                                        <div className="flex-1">
                                                                            <div className="text-[10px] text-neutral-400 uppercase">Selling</div>
                                                                            <div className="text-green-400 font-semibold">
                                                                                {order.quantity}x {sellingItem?.name || `Item #${order.itemId}`}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        {costItem?.iconUrl && (
                                                                            <img src={costItem.iconUrl} alt="" className="w-8 h-8" />
                                                                        )}
                                                                        <div className="flex-1">
                                                                            <div className="text-[10px] text-neutral-400 uppercase">Cost</div>
                                                                            <div className="text-yellow-400 font-semibold">
                                                                                {order.costPerItem}x {costItem?.name || `Item #${order.currencyId}`}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {order.amountInStock !== undefined && (
                                                                        <div className="text-[10px] text-blue-400">
                                                                            Stock: {order.amountInStock}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </foreignObject>
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Death Markers (Persistent) */}
                                {showTeam && Object.entries(deathLocations).map(([steamId, pos]) => {
                                    const screenPos = monumentToScreen(pos.x, pos.y);
                                    const radius = Math.max(5, 10 / scale);
                                    const skullSize = radius * 1.4;

                                    return (
                                        <g
                                            key={`death-${steamId}`}
                                            style={{
                                                transform: `translate(${screenPos.x}px, ${screenPos.y}px)`,
                                                transition: 'transform 0.5s ease-out'
                                            }}
                                            className="pointer-events-none"
                                        >
                                            {/* Background circle for better visibility */}
                                            <circle
                                                r={radius}
                                                fill="#52525b"
                                                stroke="white"
                                                strokeWidth={Math.max(1.5, 3 / scale)}
                                                className="drop-shadow-lg"
                                            />
                                            <g transform={`translate(-${skullSize / 2}, -${skullSize / 2})`}>
                                                <Skull size={skullSize} color="white" strokeWidth={2} />
                                            </g>
                                        </g>
                                    );
                                })}

                                {/* Live Team Positions */}
                                {showTeam && teamInfo.map((member) => {
                                    // Only render live players here (dead ones are handled above)
                                    if (!member.isAlive) return null;

                                    const pos = monumentToScreen(member.x, member.y);
                                    const radius = Math.max(5, 10 / scale);
                                    const stroke = Math.max(1.5, 3 / scale);
                                    const fontSize = Math.max(8, 12 / scale);
                                    const textOffset = Math.max(15, 25 / scale);

                                    // Determine color (Blue=Online, Red=Offline)
                                    const fillColor = member.isOnline ? '#3b82f6' : '#ef4444';

                                    return (
                                        <g key={`team-${member.steamId}`}>
                                            <circle
                                                cx={pos.x}
                                                cy={pos.y}
                                                r={radius}
                                                fill={fillColor}
                                                stroke="white"
                                                strokeWidth={stroke}
                                                className="drop-shadow-lg"
                                                style={{
                                                    transition: 'cx 0.5s ease-out, cy 0.5s ease-out, fill 0.3s ease'
                                                }}
                                            />

                                            <text
                                                x={pos.x}
                                                y={pos.y + textOffset}
                                                fill="white"
                                                fontSize={fontSize}
                                                fontWeight="bold"
                                                textAnchor="middle"
                                                className="drop-shadow-lg pointer-events-none"
                                                style={{
                                                    textShadow: '0 0 4px rgba(0,0,0,0.8)',
                                                    transition: 'x 0.5s ease-out, y 0.5s ease-out'
                                                }}
                                            >
                                                {member.name}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-4 grid grid-cols-3 gap-4">
                {showMonuments && mapData.monuments && mapData.monuments.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            Monuments
                        </h3>
                        <p className="text-xs text-neutral-400">
                            {mapData.monuments.length} monuments visible
                        </p>
                    </div>
                )}

                {showMarkers && markers.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Active Markers
                        </h3>
                        <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            {Array.from(new Set(markers.map(m => m.type))).map(type => {
                                const count = markers.filter(m => m.type === type).length;
                                return (
                                    <div key={String(type)} className="flex items-center gap-2 text-xs">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: getMarkerColor(type) }}
                                        />
                                        <span className="text-neutral-300">
                                            {getMarkerTypeName(type)} ({count})
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {showTeam && teamInfo.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Team Members
                        </h3>
                        <div className="space-y-1">
                            {teamInfo.map((member, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                    <div
                                        className={`w-2 h-2 rounded-full ${member.isAlive ? 'bg-green-500' : 'bg-red-500'}`}
                                    />
                                    <span className={member.isAlive ? 'text-neutral-300' : 'text-neutral-500'}>
                                        {member.name} {member.isOnline ? '(Online)' : '(Offline)'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
