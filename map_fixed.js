import { 
    db, 
    getCrimeColor, 
    formatDate, 
    getSeverityText, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    onSnapshot, 
    addDoc, 
    Timestamp 
} from './config.js';

export default class CrimeMap {
    constructor() {
        this.map = null;
        this.markers = new Map();
        this.heatmapLayer = null;
        this.hotspotLayer = null;
        this.markerCluster = null;
        this.tempMarker = null;
        this.unsubscribe = null;
        this.lastUpdate = null;
        this.userLocation = null;
        this.routeLayer = null;
        this.routeControl = null;
        this.routeWaypoints = [null, null];
        this.safetyLevel = 2;
        this.currentView = 'heatmap';
        this.reportModal = null;
        this.activeFilters = {
            types: new Set(['theft', 'assault', 'burglary', 'fraud', 'vandalism']),
            dateRange: '7',
        };

        this.init();
    }

    // ... [rest of your existing methods]

    createClusterIcon = (cluster) => {
        const count = cluster.getChildCount();
        const size = count > 50 ? 'large' : count > 10 ? 'medium' : 'small';
        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: [40, 40]
        });
    }
}
