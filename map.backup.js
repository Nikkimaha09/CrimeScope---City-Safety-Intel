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

    init() {
        try {
            console.log('Initializing map...');
            
            // Add willReadFrequently to canvas for better performance
            const canvas = document.createElement('canvas');
            if (canvas.getContext) {
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                console.log('Canvas 2D context initialized with willReadFrequently');
            }
            
            // Initialize the map centered on Hyderabad
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                throw new Error('Map container not found');
            }
            
            // Make sure the map container has dimensions
            if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
                console.warn('Map container has zero dimensions, forcing size');
                mapElement.style.height = 'calc(100vh - 60px)';
                mapElement.style.width = '100%';
            }
            
            // Initialize the map
            this.map = L.map('map', {
                zoomControl: true,
                preferCanvas: true,
                zoom: 13,
                center: [17.3850, 78.4867],
                renderer: L.canvas()
            });
            
            // Debug: Log map container info
            console.log('Map container dimensions:', {
                width: mapElement.offsetWidth,
                height: mapElement.offsetHeight,
                computedStyle: window.getComputedStyle(mapElement)
            });

            console.log('Adding tile layer...');
            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors',
                detectRetina: true
            }).addTo(this.map);

            // Add scale control
            L.control.scale().addTo(this.map);
            
            // Initialize marker cluster group
            console.log('Initializing marker cluster group...');
            this.markerCluster = L.markerClusterGroup({
                maxClusterRadius: 40,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                spiderfyOnMaxZoom: true,
                disableClusteringAtZoom: 17
            });
            
            // Add marker cluster to map
            this.map.addLayer(this.markerCluster);
            console.log('Marker cluster initialized');
            
            // Force a resize to ensure map renders correctly
            setTimeout(() => {
                this.map.invalidateSize({ animate: true });
                console.log('Map invalidated after delay');
            }, 100);

            // Add event listeners
            this.setupEventListeners();

            // Load initial data
            console.log('Loading crime data...');
            this.loadCrimeData();
            
            // Update debug info
            this.updateDebugInfo();
            
        } catch (error) {
            console.error('Error initializing map:', error);
            this.showToast('Failed to initialize map: ' + error.message, 'danger');
            
            // Try to recover by reloading the page after a delay
            setTimeout(() => {
                console.log('Attempting to recover by reloading the page...');
                window.location.reload();
            }, 3000);
        }
    }

    setupEventListeners() {
        // Add zoom control
        L.control.zoom({
            position: 'topright'
        }).addTo(this.map);

        // Handle report crime button click
        const reportCrimeBtn = document.getElementById('report-crime-btn');
        if (reportCrimeBtn) {
            reportCrimeBtn.addEventListener('click', () => {
                this.currentView = 'report';
                this.enableReportMode();
            });
        }

        // Handle cancel report button
        const cancelReportBtn = document.getElementById('cancel-report-btn');
        if (cancelReportBtn) {
            cancelReportBtn.addEventListener('click', () => {
                this.disableReportMode();
            });
        }

        // Handle form submission
        const reportForm = document.getElementById('reportForm');
        if (reportForm) {
            reportForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleReportSubmit(e);
            });
            console.log('Form submit event listener added');
        } else {
            console.error('Report form not found');
        }

        // Map click event for report mode
        this.map.on('click', (e) => {
            if (this.currentView === 'report') {
                this.handleMapClickForReport(e);
            }
        });

        // Map move end event (for updating visible crimes)
        this.map.on('moveend', () => {
            if (this.currentView === 'heatmap') {
                this.updateHeatmap();
            }
        });
    }

    async loadCrimeData() {
        try {
            // Show loading indicator
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'block';

            // Clear existing markers
            this.markers.clear();
            if (this.markerCluster) {
                this.markerCluster.clearLayers();
            }

            // Use sample data for now
            this.useSampleData();
            
            // Update last update time
            this.lastUpdate = new Date();
            this.updateLastUpdatedTime();

        } catch (error) {
            console.error('Error loading crime data:', error);
            // Fallback to sample data if there's an error
            this.useSampleData();
        } finally {
            // Hide loading indicator
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    createClusterIcon(cluster) {
        const count = cluster.getChildCount();
        const size = count > 50 ? 'large' : count > 10 ? 'medium' : 'small';
        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: [40, 40]
        });
    }

    enableReportMode() {
        // Change cursor to crosshair
        this.map.getContainer().style.cursor = 'crosshair';
        
        // Remove any existing temp marker
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }

        // Show the report modal
        const reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
        reportModal.show();
        
        // Enable location input if available
        const locationInput = document.getElementById('location');
        if (locationInput) {
            locationInput.readOnly = true;
        }
    }
    
    disableReportMode() {
        // Reset cursor
        this.map.getContainer().style.cursor = '';
        
        // Remove temp marker if exists
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
        
        // Hide the report modal
        const reportModal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
        if (reportModal) {
            reportModal.hide();
        }
        
        // Reset the form
        const reportForm = document.getElementById('report-form');
        if (reportForm) {
            reportForm.reset();
        }
        
        // Reset view
        this.currentView = 'heatmap';
    }

    handleMapClickForReport(e) {
        console.log('Map clicked at:', e.latlng);
        
        // Remove existing temp marker if any
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
        }
        
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        // Add new temp marker at click location with animation
        this.tempMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'crime-marker temp',
                html: '<div style="background-color: #ff0000; border-radius: 50%; width: 14px; height: 14px;"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            }),
            zIndexOffset: 1000
        }).addTo(this.map);
        
        // Update form fields with coordinates
        const latInput = document.getElementById('latitude');
        const lngInput = document.getElementById('longitude');
        const locationInput = document.getElementById('location');
        
        if (latInput && lngInput) {
            latInput.value = lat;
            lngInput.value = lng;
            console.log('Updated coordinates:', { lat, lng });
        }
        
        if (locationInput) {
            // Show coordinates immediately
            locationInput.value = `Location selected (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
            
            // Try to get the address using reverse geocoding
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.display_name) {
                        const address = data.display_name.split(',').slice(0, 3).join(',');
                        locationInput.value = address;
                    }
                })
                .catch(error => {
                    console.error('Reverse geocoding failed:', error);
                    // Keep the coordinates display if geocoding fails
                    locationInput.value = `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
                });
        }
        
        // Show a message to the user
        this.showToast('Location selected. Please fill in the crime details.', 'info');
    }
    
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.role = 'alert';
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
                type: formData.get('crimeType') || 'other',
                description: formData.get('description') || '',
                severity: parseInt(formData.get('severity') || '3'),
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
            const response = await fetch('/api/report-crime', {
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
            if (window.dashboard && typeof window.dashboard.loadDashboardData === 'function') {
                window.dashboard.loadDashboardData();
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

    useSampleData() {
        // Sample data to show when API is not available
        const sampleCrimes = [
            {
                id: 'sample1',
                type: 'theft',
                description: 'Sample theft incident',
                severity: 3,
                latitude: 20.5937 + (Math.random() * 0.1 - 0.05),
                longitude: 78.9629 + (Math.random() * 0.1 - 0.05),
                timestamp: { toDate: () => new Date() }
            },
            {
                id: 'sample2',
                type: 'assault',
                description: 'Sample assault incident',
                severity: 4,
                latitude: 20.5937 + (Math.random() * 0.1 - 0.05),
                longitude: 78.9629 + (Math.random() * 0.1 - 0.05),
                timestamp: { toDate: () => new Date() }
            }
        ];
        
        sampleCrimes.forEach(crime => this.addCrimeMarker(crime));
        if (this.markerCluster && this.map) {
            this.map.addLayer(this.markerCluster);
        }
        
        // Show notification about using sample data
        const notification = document.createElement('div');
        notification.className = 'alert alert-warning alert-dismissible fade show';
        notification.role = 'alert';
        notification.innerHTML = `
            Using sample data. The API endpoint /api/crimes is not available.
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.body.prepend(notification);
    }

    updateLastUpdatedTime() {
        const lastUpdatedElement = document.getElementById('last-updated');
        if (lastUpdatedElement && this.lastUpdate) {
            lastUpdatedElement.textContent = `Last updated: ${this.lastUpdate.toLocaleTimeString()}`;
        }
    }
    
    updateDebugInfo() {
        try {
            const debugEl = document.getElementById('map-debug');
            if (!debugEl) return;
            
            if (!this.map) {
                debugEl.textContent = 'Map not initialized';
                return;
            }
            
            const center = this.map.getCenter();
            const zoom = this.map.getZoom();
            const size = this.map.getSize();
            const markerCount = this.markerCluster ? this.markerCluster.getLayers().length : 0;
            
            debugEl.innerHTML = `
                <strong>Map Debug Info:</strong><br>
                Center: ${center?.lat?.toFixed(4)}, ${center?.lng?.toFixed(4)}<br>
                Zoom: ${zoom}<br>
                Size: ${size?.x}x${size?.y}px<br>
                Markers: ${markerCount}
            `;
            
        } catch (error) {
            console.error('Error updating debug info:', error);
        }
    }

    addCrimeMarker(crime) {
        try {
            console.log('Adding crime marker:', crime);
            
            // Validate input
            if (!crime.latitude || !crime.longitude) {
                throw new Error('Missing coordinates for crime marker');
            }
            
            // Ensure map is initialized
            if (!this.map) {
                console.warn('Map not initialized when adding marker');
                this.init(); // Try to reinitialize map
                if (!this.map) {
                    throw new Error('Map initialization failed');
                }
            }
            
            // Ensure marker cluster is initialized
            if (!this.markerCluster) {
                console.warn('Marker cluster not initialized, creating new one');
                this.markerCluster = L.markerClusterGroup({
                    maxClusterRadius: 40,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true
                });
                this.map.addLayer(this.markerCluster);
            }

            // Define marker styles based on crime type
            const crimeIcons = {
                'theft': { icon: 'fa-bag-shopping', color: '#ff9800' },
                'assault': { icon: 'fa-hand-fist', color: '#f44336' },
                'burglary': { icon: 'fa-house-lock', color: '#9c27b0' },
                'fraud': { icon: 'fa-money-bill-transfer', color: '#2196f3' },
                'vandalism': { icon: 'fa-spray-can-sparkles', color: '#4caf50' },
                'default': { icon: 'fa-triangle-exclamation', color: '#607d8b' }
            };

            const crimeType = crime.type?.toLowerCase() || 'default';
            const iconInfo = crimeIcons[crimeType] || crimeIcons['default'];
            
            console.log('Creating marker at:', crime.latitude, crime.longitude);
            
            // Create a custom marker with icon
            const marker = L.marker([crime.latitude, crime.longitude], {
                icon: L.divIcon({
                    className: 'crime-marker',
                    html: `
                        <div class="crime-marker-container" style="color: ${iconInfo.color}">
                            <i class="fa-solid ${iconInfo.icon}"></i>
                            <div class="pulse-effect"></div>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -32],
                    className: 'crime-marker-icon'
                }),
                zIndexOffset: 1000 // Ensure markers appear above other layers
            });

            console.log('Marker created, adding to map...');
            
            // Add popup with crime details
            marker.bindPopup(this.createCrimePopup(crime));
            
            // Store reference to the marker
            const markerId = crime.id || `crime_${Date.now()}`;
            this.markers.set(markerId, marker);
            
            // Make sure marker cluster exists and is added to the map
            if (!this.markerCluster) {
                console.log('Creating new marker cluster group');
                this.markerCluster = L.markerClusterGroup({
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true
                });
                this.map.addLayer(this.markerCluster);
            } else if (!this.map.hasLayer(this.markerCluster)) {
                console.log('Adding existing marker cluster to map');
                this.map.addLayer(this.markerCluster);
            }
            
            // Add marker to cluster group
            console.log('Adding marker to cluster group');
            this.markerCluster.addLayer(marker);
            
            // Force a redraw of the marker cluster
            this.markerCluster.refreshClusters();
            
            // If this is a new report, pan to it
            if (crime.id && crime.id.startsWith('temp_')) {
                console.log('Panning to new marker');
                this.map.setView([crime.latitude, crime.longitude], Math.max(this.map.getZoom(), 15), {
                    animate: true,
                    duration: 1
                });
                
                // Add animation class
                const markerElement = marker.getElement();
                if (markerElement) {
                    markerElement.classList.add('new-crime');
                    setTimeout(() => {
                        markerElement.classList.remove('new-crime');
                    }, 3000);
                }
            }
            
            // Update heatmap if in heatmap view
            if (this.currentView === 'heatmap') {
                console.log('Updating heatmap');
                this.updateHeatmap();
            }
            
            console.log('Crime marker added successfully');
            return marker;
            
        } catch (error) {
            console.error('Error adding crime marker:', error);
            return null;
        }
    }

    createCrimePopup(crime) {
        const severity = crime.severity || 1;
        const severityText = getSeverityText(severity);
        const severityClass = severityText.toLowerCase();
        const formattedDate = crime.timestamp ? formatDate(crime.timestamp.toDate ? crime.timestamp.toDate() : new Date(crime.timestamp)) : 'Just now';
        
        return `
            <div class="crime-popup">
                <div class="crime-popup-header">
                    <h4>${(crime.type || 'Incident').charAt(0).toUpperCase() + (crime.type || 'Incident').slice(1)}</h4>
                    <span class="severity-badge ${severityClass}">${severityText}</span>
                </div>
                <div class="crime-popup-body">
                    <p>${crime.description || 'No description provided'}</p>
                    ${crime.location ? `<p class="location"><i class="fas fa-map-marker-alt"></i> ${crime.location}</p>` : ''}
                </div>
                <div class="crime-popup-footer">
                    <small class="text-muted">
                        <i class="far fa-clock"></i> ${formattedDate}
                        ${crime.reported_by ? `<br><i class="far fa-user"></i> ${crime.reported_by}` : ''}
                    </small>
                </div>
            </div>
        `;
    }
}
