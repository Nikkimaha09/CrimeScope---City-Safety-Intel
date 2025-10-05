console.log('alerts.js loaded');

// Global variables
let map;
let userMarker = null;
let userLocation = null;
let alerts = [];
let markers = [];
let accuracyCircle = null;

// Default location (San Francisco)
const DEFAULT_LAT = 37.7749;
const DEFAULT_LNG = -122.4194;

// Debug function to check if Leaflet is loaded
function checkLeaflet() {
    console.log('Checking Leaflet...');
    if (typeof L === 'undefined') {
        console.error('Leaflet is not loaded!');
        return false;
    }
    console.log('Leaflet version:', L.version);
    return true;
}

// Check if Bootstrap is loaded
function checkBootstrap() {
    console.log('Checking Bootstrap...');
    if (typeof bootstrap === 'undefined') {
        console.error('Bootstrap is not loaded!');
        return false;
    }
    console.log('Bootstrap is loaded');
    return true;
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, starting initialization...');
    
    // Show loading state
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        console.log('Showing loading indicator');
        loadingEl.classList.remove('d-none');
    } else {
        console.error('Loading element not found');
    }
    
    // Initialize the map
    if (!initMap()) {
        console.error('Failed to initialize map');
        showToast('Error initializing map', 'danger');
        return;
    }
    
    // Set up form submission handler
    const alertForm = document.getElementById('alert-form');
    if (alertForm) {
        alertForm.addEventListener('submit', handleAlertSubmit);
    }
    
    // Load initial alerts
    loadAlerts();
    
    // Try to get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            handleLocationSuccess,
            handleLocationError,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        console.warn('Geolocation is not supported by this browser');
        showToast('Geolocation is not supported by your browser', 'warning');
    }
});

// Initialize the map
function initMap() {
    console.log('Initializing map...');
    
    // Verify map container exists and is visible
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        const errorMsg = 'Map container not found!';
        console.error(errorMsg);
        showToast('Error: ' + errorMsg, 'danger');
        return false;
    }
    
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        const errorMsg = 'Leaflet library not loaded!';
        console.error(errorMsg);
        showToast('Error: ' + errorMsg, 'danger');
        return false;
    }
    
    console.log('Leaflet version:', L.version);
    console.log('Map container dimensions:', {
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        display: window.getComputedStyle(mapContainer).display,
        visibility: window.getComputedStyle(mapContainer).visibility
    });
    
    try {
        // Check if map is already initialized
        if (map) {
            console.log('Map already initialized, removing old instance');
            map.remove();
        }
        
        // Initialize map with a default view (Hyderabad coordinates)
        map = L.map('map', {
            center: [17.3850, 78.4867],
            zoom: 13,
            tap: true,
            tapTolerance: 15
        });
        
        console.log('Map instance created:', map);
        
        // Add the OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            tap: true
        }).addTo(map);
        
        // Add scale control
        L.control.scale().addTo(map);
        
        console.log('Map initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing map:', error);
        showToast('Error initializing map. Please check console for details.', 'danger');
        return false;
    }
}

// Handle successful geolocation
function handleLocationSuccess(position) {
    console.log('Got user location:', position);
    
    const { latitude, longitude, accuracy } = position.coords;
    userLocation = { lat: latitude, lng: longitude };
    
    // Update map view
    if (map) {
        map.setView([latitude, longitude], 15);
        
        // Add or update user location marker
        if (userMarker) {
            userMarker.setLatLng([latitude, longitude]);
        } else {
            userMarker = L.marker([latitude, longitude], {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<i class="fas fa-location-dot" style="color: #3498db; font-size: 24px;"></i>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 32]
                }),
                zIndexOffset: 1000
            }).addTo(map);
            
            userMarker.bindPopup('Your Location').openPopup();
        }
        
        // Add accuracy circle
        if (accuracyCircle) {
            map.removeLayer(accuracyCircle);
        }
        
        accuracyCircle = L.circle([latitude, longitude], {
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.2,
            radius: accuracy
        }).addTo(map);
    }
    
    // Reload alerts with user's location
    loadAlerts();
}

// Handle geolocation error
function handleLocationError(error) {
    console.warn('Error getting location:', error);
    
    let errorMessage = 'Error getting your location: ';
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage += 'User denied the request for geolocation.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
        case error.TIMEOUT:
            errorMessage += 'The request to get user location timed out.';
            break;
        case error.UNKNOWN_ERROR:
            errorMessage += 'An unknown error occurred.';
            break;
    }
    
    showToast(errorMessage, 'warning');
    
    // Load alerts with default location if user location is not available
    loadAlerts();
}

// Load alerts from the server
async function loadAlerts() {
    console.log('Loading alerts...');
    
    const loadingEl = document.getElementById('loading');
    
    let url = '/api/alerts/nearby';
    let params = new URLSearchParams();
    
    if (userLocation && userLocation.coords && userLocation.coords.latitude && userLocation.coords.longitude) {
        const lat = userLocation.coords.latitude;
        const lng = userLocation.coords.longitude;
        params.append('lat', lat);
        params.append('lng', lng);
        console.log(`Using user location: ${lat}, ${lng}`);
    } else {
        params.append('lat', DEFAULT_LAT);
        params.append('lng', DEFAULT_LNG);
        console.log('Using default location');
    }
    
    // Add radius and limit parameters
    params.append('radius', 5);  // 5km radius
    params.append('limit', 50);  // Limit to 50 results
    
    const fullUrl = `${url}?${params.toString()}`;
    console.log(`Fetching alerts from: ${fullUrl}`);
    
    try {
        const response = await fetch(fullUrl);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        
        console.log('API response:', result);
        
        if (result && result.data) {
            console.log(`Found ${result.data.length} alerts`);
            alerts = result.data;
        } else {
            console.log('No alerts found in response');
            alerts = [];
        }
        
        renderAlerts();
        updateMapMarkers();
        
    } catch (error) {
        console.error('Error loading alerts:', error);
        
        const errorMessage = error.message || 'Failed to load alerts. Please try again later.';
        showToast(errorMessage, 'danger');
        
        // Show error in the alerts container
        if (alertsContainer) {
            alertsContainer.innerHTML = `
                <div class="alert alert-danger">
                    <strong>Error loading alerts:</strong> ${errorMessage}
                    <button class="btn btn-sm btn-outline-secondary ms-2" onclick="loadAlerts()">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>`;
        }
    } finally {
        if (loadingEl) loadingEl.classList.add('d-none');
    }
}

// Render alerts in the UI
function renderAlerts() {
    const alertsContainer = document.getElementById('alerts-container');
    if (!alertsContainer) return;
    
    if (alerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="alert alert-info">
                No alerts found in your area. Be the first to report an incident!
            </div>`;
        return;
    }
    
    // Sort alerts by date (newest first)
    const sortedAlerts = [...alerts].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );
    
    // Generate HTML for alerts
    const alertsHtml = sortedAlerts.map(alert => `
        <div class="card mb-3 alert-card">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h5 class="card-title">${escapeHtml(alert.title || 'Untitled Alert')}</h5>
                        <h6 class="card-subtitle mb-2 text-muted">
                            <span class="badge bg-${getSeverityBadgeClass(alert.severity)}">
                                <i class="fas ${getAlertIcon(alert.severity)} me-1"></i>
                                ${alert.severity || 'Unknown'}
                            </span>
                            <small class="ms-2">
                                <i class="far fa-clock me-1"></i>
                                ${formatDate(alert.created_at)}
                            </small>
                        </h6>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" 
                            onclick="showOnMap(${alert.latitude}, ${alert.longitude})">
                        <i class="fas fa-map-marker-alt"></i> Show on Map
                    </button>
                </div>
                <p class="card-text mt-2">${escapeHtml(alert.description || 'No description provided.')}</p>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">
                        <i class="fas fa-user me-1"></i>
                        ${escapeHtml(alert.reported_by || 'Anonymous')}
                    </small>
                    <small class="text-muted">
                        <i class="fas fa-map-marker-alt me-1"></i>
                        ${formatDistance(alert.distance)}
                    </small>
                </div>
            </div>
        </div>
    `).join('');
    
    alertsContainer.innerHTML = alertsHtml;
}

// Update map markers for alerts
function updateMapMarkers() {
    console.log('Updating map markers with', alerts.length, 'alerts');
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    if (!map) {
        console.error('Map not initialized');
        return;
    }
    
    // Add markers for each alert
    alerts.forEach(alert => {
        if (!alert.latitude || !alert.longitude) {
            console.warn('Alert missing coordinates:', alert);
            return;
        }
        
        try {
            const severity = alert.severity || 'medium';
            const iconColor = getSeverityColor(severity);
            const iconHtml = `<i class="fas ${getAlertIcon(severity)}" style="color: ${iconColor}; font-size: 24px; text-shadow: 0 0 3px white;"></i>`;
            
            const marker = L.marker(
                [parseFloat(alert.latitude), parseFloat(alert.longitude)], 
                {
                    icon: L.divIcon({
                        className: 'alert-marker',
                        html: iconHtml,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -30]
                    }),
                    title: alert.title || 'Alert'
                }
            ).addTo(map);
            
            const popupContent = `
                <div style="min-width: 200px;">
                    <h6 class="mb-1">${escapeHtml(alert.title || 'Untitled Alert')}</h6>
                    <p class="mb-1">${escapeHtml(alert.description || 'No description')}</p>
                    <div class="small text-muted">
                        <div><i class="fas fa-user me-1"></i> ${escapeHtml(alert.reported_by || 'Anonymous')}</div>
                        <div><i class="far fa-clock me-1"></i> ${formatDate(alert.created_at)}</div>
                        <div class="mt-1">
                            <span class="badge bg-${getSeverityBadgeClass(severity)}">
                                <i class="fas ${getAlertIcon(severity)} me-1"></i>${severity}
                            </span>
                        </div>
                    </div>
                </div>`;
            
            marker.bindPopup(popupContent);
            markers.push(marker);
            
        } catch (error) {
            console.error('Error creating marker for alert:', alert, error);
        }
    });
    
    // Fit map to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Show a specific location on the map
function showOnMap(lat, lng) {
    if (!map) return;
    
    map.setView([lat, lng], 15);
    
    // Add a temporary marker
    const tempMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'temp-marker',
            html: '<i class="fas fa-map-pin" style="color: #e74c3c; font-size: 24px;"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        }),
        zIndexOffset: 1000
    }).addTo(map);
    
    // Remove the temporary marker after 3 seconds
    setTimeout(() => {
        map.removeLayer(tempMarker);
    }, 3000);
}

// Handle alert form submission
async function handleAlertSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const spinner = form.querySelector('#spinner');
    
    try {
        // Show loading state
        submitBtn.disabled = true;
        if (spinner) spinner.classList.remove('d-none');
        
        const formData = new FormData(form);
        
        // Add user location if available
        if (userLocation) {
            formData.append('latitude', userLocation.lat);
            formData.append('longitude', userLocation.lng);
        }
        
        const response = await fetch('/api/alerts', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to submit alert');
        }
        
        const result = await response.json();
        
        // Show success message
        showToast('Alert submitted successfully!', 'success');
        
        // Reset form
        form.reset();
        
        // Reload alerts
        loadAlerts();
        
    } catch (error) {
        console.error('Error submitting alert:', error);
        showToast(error.message || 'Failed to submit alert. Please try again.', 'danger');
    } finally {
        // Reset form state
        submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
    }
}

// Helper function to show toast messages
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas ${getToastIcon(type)} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    // Add toast to container
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // Initialize and show the toast
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 5000
    });
    
    toast.show();
    
    // Remove toast from DOM after it's hidden
    toastEl.addEventListener('hidden.bs.toast', function() {
        toastEl.remove();
    });
}

// Helper function to get icon for toast based on type
function getToastIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'danger': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// Helper function to get severity color
function getSeverityColor(severity) {
    switch((severity || '').toLowerCase()) {
        case 'high': return '#e74c3c';
        case 'medium': return '#f39c12';
        case 'low': return '#3498db';
        default: return '#7f8c8d';
    }
}

// Helper function to get alert icon
function getAlertIcon(severity) {
    switch((severity || '').toLowerCase()) {
        case 'high': return 'fa-exclamation-triangle';
        case 'medium': return 'fa-exclamation-circle';
        case 'low': return 'fa-info-circle';
        default: return 'fa-bell';
    }
}

// Helper function to get badge class for severity
function getSeverityBadgeClass(severity) {
    switch((severity || '').toLowerCase()) {
        case 'high': return 'danger';
        case 'medium': return 'warning';
        case 'low': return 'info';
        default: return 'secondary';
    }
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Helper function to format distance
function formatDistance(distance) {
    if (distance === undefined || distance === null) return 'Unknown distance';
    
    if (distance < 1) {
        return `${Math.round(distance * 1000)}m away`;
    } else {
        return `${distance.toFixed(1)}km away`;
    }
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Make functions available globally
window.loadAlerts = loadAlerts;
window.showOnMap = showOnMap;
