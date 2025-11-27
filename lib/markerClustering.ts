// Marker clustering utility for SVG maps
// Groups nearby markers to improve performance and visual clarity

export interface ClusterableMarker {
    id: number;
    x: number;
    y: number;
    [key: string]: any; // Allow additional properties
}

export interface MarkerCluster {
    id: string; // Unique cluster ID
    x: number; // Center X (average)
    y: number; // Center Y (average)
    markers: ClusterableMarker[]; // All markers in this cluster
    count: number; // Number of markers
}

/**
 * Clusters markers that are within a certain distance of each other
 * @param markers - Array of markers to cluster
 * @param clusterRadius - Distance threshold for clustering (in map units, e.g., 50m)
 * @returns Array of clusters
 */
export function clusterMarkers(
    markers: ClusterableMarker[],
    clusterRadius: number = 50
): MarkerCluster[] {
    if (markers.length === 0) return [];

    const clusters: MarkerCluster[] = [];
    const processed = new Set<number>();

    markers.forEach((marker, idx) => {
        if (processed.has(idx)) return;

        // Start a new cluster with this marker
        const clusterMarkers: ClusterableMarker[] = [marker];
        processed.add(idx);

        // Find all nearby markers
        markers.forEach((otherMarker, otherIdx) => {
            if (processed.has(otherIdx)) return;

            const distance = Math.sqrt(
                Math.pow(marker.x - otherMarker.x, 2) +
                Math.pow(marker.y - otherMarker.y, 2)
            );

            if (distance <= clusterRadius) {
                clusterMarkers.push(otherMarker);
                processed.add(otherIdx);
            }
        });

        // Calculate cluster center (average position)
        const centerX = clusterMarkers.reduce((sum, m) => sum + m.x, 0) / clusterMarkers.length;
        const centerY = clusterMarkers.reduce((sum, m) => sum + m.y, 0) / clusterMarkers.length;

        clusters.push({
            id: `cluster-${idx}`,
            x: centerX,
            y: centerY,
            markers: clusterMarkers,
            count: clusterMarkers.length
        });
    });

    return clusters;
}

/**
 * Gets the appropriate cluster radius based on map size
 * Larger maps need larger clustering distances
 */
export function getClusterRadius(mapSize: number): number {
    // Base: 50m for 4000m map
    // Scale proportionally
    return Math.max(30, (mapSize / 4000) * 50);
}
