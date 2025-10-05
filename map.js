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

class CrimeMap {
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

    async handleReportSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Submit';
        
        try {
            // Show loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                const btnText = submitBtn.querySelector('.btn-text');
                const spinner = submitBtn.querySelector('.spinner-border');
                if (btnText) btnText.textContent = 'Submitting...';
                if (spinner) spinner.classList.remove('d-none');
            }

            // Get form data
            const formData = new FormData(form);
            const crimeData = {
                crimeType: formData.get('crimeType') || 'other',
                type: formData.get('crimeType') || 'other', // Keep both for backward compatibility
                description: formData.get('description') || '',
                severity: parseInt(formData.get('severity') || '3'),
                location: formData.get('location') || 'Selected location',
                latitude: parseFloat(formData.get('latitude') || '0'),
                longitude: parseFloat(formData.get('longitude') || '0'),
                timestamp: new Date().toISOString(),
                status: 'reported'
            };
            
            // Validate required fields
            if (!crimeData.latitude || !crimeData.longitude) {
                throw new Error('Please select a location on the map');
            }

            // Submit to backend
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(crimeData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to submit report');
            }

            // Show success message
            this.showToast('Crime reported successfully!', 'success');
            
            // Reset form
            form.reset();
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
            if (modal) modal.hide();
            
            // Reload crime data to show the new report
            this.loadCrimeData();
            
            // Refresh dashboard data to update the left panel
            try {
                if (window.dashboard && typeof window.dashboard.loadDashboardData === 'function') {
                    await window.dashboard.loadDashboardData();
                }
            } catch (error) {
                console.warn('Error updating dashboard:', error);
                // Continue even if dashboard update fails
            }

        } catch (error) {
            console.error('Error submitting crime report:', error);
            this.showToast(error.message || 'Failed to submit crime report. Please try again.', 'danger');
        } finally {
            // Reset button state
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                const btnText = submitBtn.querySelector('.btn-text');
                const spinner = submitBtn.querySelector('.spinner-border');
                if (btnText) btnText.textContent = 'Submit Report';
                if (spinner) spinner.classList.add('d-none');
            }
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        toastContainer.appendChild(toast);
        
        // Initialize and show the toast
        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: 3000
        });
        
        bsToast.show();
        
        // Remove the toast after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    // Handle map click to set location
    setupMapClickHandler() {
        if (!this.map) return;
        
        // Remove any existing click handler to avoid duplicates
        this.map.off('click');
        
        // Add click handler to set location
        this.map.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            
            // Update hidden form fields
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;
            
            // Show loading state for location
            const locationInput = document.getElementById('location');
            if (locationInput) {
                locationInput.value = 'Getting address...';
            }
            
            try {
                // Use OpenStreetMap Nominatim for reverse geocoding
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
                const data = await response.json();
                
                // Format the address
                let address = '';
                if (data.address) {
                    const addr = data.address;
                    address = [
                        addr.road,
                        addr.suburb,
                        addr.village || addr.town || addr.city,
                        addr.state,
                        addr.country
                    ].filter(Boolean).join(', ');
                } else {
                    address = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                }
                
                // Update location display
                if (locationInput) {
                    locationInput.value = address;
                }
            } catch (error) {
                console.error('Error getting address:', error);
                if (locationInput) {
                    locationInput.value = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                }
            }
            
            // Remove existing temp marker if any
            if (this.tempMarker) {
                this.map.removeLayer(this.tempMarker);
            }
            
            // Add a temporary marker at the clicked location
            this.tempMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'temp-marker',
                    html: '<i class="fas fa-map-marker-alt" style="color: #dc3545; font-size: 24px;"></i>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                })
            }).addTo(this.map);
        });
        
        // Initialize form submission
        this.setupFormSubmission();
    }
    
    // Setup form submission
    setupFormSubmission() {
        const form = document.getElementById('reportForm');
        if (!form) return;
        
        // Remove any existing submit handlers to avoid duplicates
        form.onsubmit = null;
        
        // Add new submit handler
        form.onsubmit = (e) => this.handleReportSubmit(e);
        
        // Update severity value display
        const severityInput = document.getElementById('severity');
        const severityValue = document.getElementById('severity-value');
        if (severityInput && severityValue) {
            severityInput.addEventListener('input', (e) => {
                severityValue.textContent = e.target.value;
            });
        }
    }

    // Initialize the map
    init() {
        try {
            console.log('Initializing map...');
            
            // Get map container and verify it exists
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                throw new Error('Map container element not found');
            }
            
            // Log container dimensions and styles for debugging
            const containerStyle = window.getComputedStyle(mapElement);
            console.log('Map container details:', {
                width: mapElement.offsetWidth,
                height: mapElement.offsetHeight,
                display: containerStyle.display,
                position: containerStyle.position,
                visibility: containerStyle.visibility,
                parentElement: mapElement.parentElement ? mapElement.parentElement.id : 'no parent'
            });
            
            // Check if Leaflet is loaded
            if (typeof L === 'undefined') {
                throw new Error('Leaflet library not loaded');
            }
            
            console.log('Leaflet version:', L.version);
            
            // Initialize the map centered on a default location (India)
            this.map = L.map('map', {
                center: [20.5937, 78.9629], // Center of India
                zoom: 5,
                zoomControl: false,
                preferCanvas: true, // Better performance for many markers
                renderer: L.canvas() // Use canvas renderer for better performance
            });
            
            console.log('Map instance created:', this.map);

            // Add OpenStreetMap tiles with error handling
            try {
                this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19,
                    detectRetina: true
                }).addTo(this.map);
                console.log('Tile layer added successfully');
            } catch (tileError) {
                console.error('Error adding tile layer:', tileError);
                throw new Error('Failed to load map tiles');
            }
            
            // Add zoom control with position
            L.control.zoom({
                position: 'topright'
            }).addTo(this.map);

            // Initialize marker cluster group
            this.markerCluster = L.markerClusterGroup({
                iconCreateFunction: this.createClusterIcon.bind(this)
            });
            this.map.addLayer(this.markerCluster);

            // Load crime data
            this.loadCrimeData();

            // Initialize report modal
            const reportModalElement = document.getElementById('reportModal');
            if (reportModalElement) {
                this.reportModal = new bootstrap.Modal(reportModalElement);
                
                // Reset form when modal is shown
                reportModalElement.addEventListener('show.bs.modal', () => {
                    const form = document.getElementById('reportForm');
                    if (form) form.reset();
                    
                    // Reset temp marker
                    if (this.tempMarker) {
                        this.map.removeLayer(this.tempMarker);
                        this.tempMarker = null;
                    }
                    
                    // Reset location fields
                    document.getElementById('latitude').value = '';
                    document.getElementById('longitude').value = '';
                    document.getElementById('location').value = '';
                });
            }
            
            // Setup map click handler for location selection
            this.setupMapClickHandler();
            
            // Add event listener for report crime button
            const reportBtn = document.getElementById('report-crime-btn');
            if (reportBtn) {
                reportBtn.addEventListener('click', () => {
                    console.log('Report crime button clicked');
                    if (this.reportModal) {
                        this.reportModal.show();
                    } else {
                        console.error('Report modal not initialized');
                    }
                });
            } else {
                console.error('Report crime button not found');
            }
            
            // Update debug info
            const debugEl = document.getElementById('map-debug');
            if (debugEl) {
                debugEl.textContent = 'Map initialized successfully';
                setTimeout(() => debugEl.remove(), 3000);
            }
            
            return true;
        } catch (error) {
            console.error('Error initializing map:', error);
            const debugEl = document.getElementById('map-debug');
            if (debugEl) {
                debugEl.textContent = `Error: ${error.message}`;
                debugEl.style.backgroundColor = '#ffebee';
            }
            throw error; // Re-throw to be caught by the module loader
        }
    }

    async loadCrimeData() {
        try {
            console.log('Loading crime data...');
            
            // Clear existing markers
            this.markers.clear();
            if (this.markerCluster) {
                this.markerCluster.clearLayers();
            }

            // Fetch crime data from the API
            const response = await fetch('/api/crimes');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check if data is an array, if not try to extract crimes from the response
            let crimes = [];
            if (Array.isArray(data)) {
                crimes = data;
            } else if (data && Array.isArray(data.crimes)) {
                crimes = data.crimes;
            } else if (data && data.data && Array.isArray(data.data)) {
                crimes = data.data;
            } else {
                console.warn('Unexpected API response format:', data);
                throw new Error('Invalid data format received from server');
            }
            
            console.log(`Loaded ${crimes.length} crimes`);
            
            // Add markers for each crime
            crimes.forEach(crime => {
                this.addCrimeMarker(crime);
            });
            
            // Fit map to show all markers if there are any
            if (crimes.length > 0 && this.markerCluster.getLayers().length > 0) {
                this.map.fitBounds(this.markerCluster.getBounds());
            } else {
                // If no crimes, set a default view
                this.map.setView([20.5937, 78.9629], 5);
            }
            
            // Update last update time
            this.lastUpdate = new Date();
            this.updateLastUpdatedTime();
            
        } catch (error) {
            console.error('Error loading crime data:', error);
            this.showToast('Failed to load crime data. Using sample data instead.', 'warning');
            console.log('Falling back to sample data...');
            this.useSampleData();
        }
    }

    addCrimeMarker(crime) {
        try {
            // Skip if required properties are missing
            if (!crime || !crime.latitude || !crime.longitude) {
                console.warn('Invalid crime data:', crime);
                return null;
            }

            // Create marker
            const marker = L.marker(
                [crime.latitude, crime.longitude],
                {
                    icon: L.divIcon({
                        className: 'crime-marker',
                        html: `<div style="background: ${getCrimeColor(crime.severity || 3)}"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                        popupAnchor: [0, -10]
                    }),
                    title: crime.type || 'Crime',
                    alt: crime.type || 'Crime',
                    riseOnHover: true
                }
            );

            // Add popup
            const popupContent = `
                <div class="crime-popup">
                    <h6>${crime.type ? crime.type.charAt(0).toUpperCase() + crime.type.slice(1) : 'Crime'}</h6>
                    ${crime.description ? `<p>${crime.description}</p>` : ''}
                    <div class="crime-details">
                        <span class="badge bg-${getSeverityText(crime.severity || 3).toLowerCase()}">
                            Severity: ${crime.severity || 'N/A'}
                        </span>
                        ${crime.timestamp ? `<small class="text-muted d-block mt-1">
                            ${formatDate(crime.timestamp)}
                        </small>` : ''}
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent, { maxWidth: 300, minWidth: 200 });

            // Add to map and store reference
            this.markerCluster.addLayer(marker);
            this.markers.set(crime.id || Date.now(), marker);
            
            return marker;
        } catch (error) {
            console.error('Error adding crime marker:', error, crime);
            return null;
        }
    }

    useSampleData() {
        try {
            console.log('Generating sample crime data...');
            
            // Clear any existing markers first
            if (this.markerCluster) {
                this.markerCluster.clearLayers();
            }
            
            const sampleCrimes = [
                {
                    id: 'sample1',
                    type: 'theft',
                    description: 'Sample theft incident',
                    severity: 3,
                    latitude: 20.5937 + (Math.random() * 2 - 1),  // Wider spread
                    longitude: 78.9629 + (Math.random() * 2 - 1), // Wider spread
                    timestamp: new Date().toISOString()
                },
                {
                    id: 'sample2',
                    type: 'assault',
                    description: 'Sample assault incident',
                    severity: 4,
                    latitude: 20.5937 + (Math.random() * 2 - 1),  // Wider spread
                    longitude: 78.9629 + (Math.random() * 2 - 1), // Wider spread
                    timestamp: new Date().toISOString()
                },
                // Add a few more sample points for better visualization
                {
                    id: 'sample3',
                    type: 'burglary',
                    description: 'Sample burglary',
                    severity: 2,
                    latitude: 20.5937 + (Math.random() * 2 - 1),
                    longitude: 78.9629 + (Math.random() * 2 - 1),
                    timestamp: new Date().toISOString()
                },
                {
                    id: 'sample4',
                    type: 'vandalism',
                    description: 'Sample vandalism',
                    severity: 1,
                    latitude: 20.5937 + (Math.random() * 2 - 1),
                    longitude: 78.9629 + (Math.random() * 2 - 1),
                    timestamp: new Date().toISOString()
                }
            ];
            
            console.log('Adding sample markers to the map...');
            sampleCrimes.forEach((crime, index) => {
                console.log(`Adding crime marker ${index + 1}:`, crime);
                this.addCrimeMarker(crime);
            });
            
            if (this.markerCluster && this.map) {
                const layers = this.markerCluster.getLayers();
                console.log(`Added ${layers.length} markers to the map`);
                
                if (layers.length > 0) {
                    this.map.fitBounds(this.markerCluster.getBounds());
                    console.log('Map bounds updated to show all markers');
                } else {
                    console.warn('No markers were added to the map');
                    this.map.setView([20.5937, 78.9629], 5);
                }
            } else {
                console.error('Marker cluster or map not initialized');
            }
            
            // Update last update time
            this.lastUpdate = new Date();
            this.updateLastUpdatedTime();
            
        } catch (error) {
            console.error('Error in useSampleData:', error);
            this.showToast('Error loading sample data', 'danger');
        }
    }

    updateLastUpdatedTime() {
        const timeEl = document.getElementById('last-updated-time');
        if (timeEl && this.lastUpdate) {
            timeEl.textContent = `Last updated: ${this.lastUpdate.toLocaleTimeString()}`;
        }
    }

    createClusterIcon(cluster) {
        const childCount = cluster.getChildCount();
        let size = 'large';
        if (childCount < 10) {
            size = 'small';
        } else if (childCount < 100) {
            size = 'medium';
        }

        const severity = Math.min(Math.floor(childCount / 5) + 2, 5);
        const color = getCrimeColor(severity);
        
        return L.divIcon({
            html: `<div><span>${childCount}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: new L.Point(40, 40),
            style: `background-color: ${color}80;`,
            iconAnchor: [20, 20]
        });
    }
}

// Export the CrimeMap class
export default CrimeMap;
