/**
 * Dashboard functionality for CrimeScope
 * Handles the crime statistics chart and dashboard updates
 */

// Global variables
let crimeChart = null;
let isLoading = false;
let lastUpdateTime = null;

// Chart configuration
const CHART_CONFIG = {
    type: 'doughnut',
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    padding: 15,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    font: {
                        size: 12
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / (total || 1)) * 100);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        },
        cutout: '60%',
        animation: {
            animateScale: true,
            animateRotate: true
        },
        onHover: (event, chartElement) => {
            // Change cursor style when hovering over chart elements
            if (event.native && event.native.target) {
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            }
        }
    }
};

// DOM Elements
const elements = {
    totalCrimes: document.getElementById('total-crimes'),
    todayCrimes: document.getElementById('today-crimes'),
    chartLoading: document.getElementById('chart-loading'),
    noDataMessage: document.getElementById('no-data-message'),
    lastUpdated: document.getElementById('last-updated')
};

/**
 * Set loading state for the dashboard
 * @param {boolean} loading - Whether to show or hide loading state
 */
function setLoadingState(loading) {
    isLoading = loading;
    
    if (elements.chartLoading) {
        elements.chartLoading.style.display = loading ? 'block' : 'none';
    }
    
    // Disable filters while loading
    const filters = document.querySelectorAll('#dateRangeFilter, #crimeTypeFilter, #apply-filters-btn');
    filters.forEach(filter => {
        if (filter) filter.disabled = loading;
    });
}

/**
 * Format a number with commas as thousand separators
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, danger, warning, info)
 * @param {number} [duration=5000] - How long to show the toast in milliseconds
 */
function showToast(message, type = 'info', duration = 5000) {
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
        delay: duration
    });
    
    bsToast.show();
    
    // Remove the toast after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

/**
 * Initialize the crime distribution chart
 */
function initCrimeChart() {
    const ctx = document.getElementById('crimeChart');
    if (!ctx) return;
    
    crimeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF',
                    '#FF9F40',
                    '#8AC24A',
                    '#FF5252',
                    '#9C27B0',
                    '#00BCD4'
                ],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: CHART_CONFIG.options
    });
}

/**
 * Load dashboard data from the API
 */
async function loadDashboardData() {
    // Prevent multiple simultaneous requests
    if (isLoading) {
        console.log('Dashboard data is already loading...');
        return;
    }
    
    try {
        console.log('Loading dashboard data...');
        setLoadingState(true);
        
        // Show loading state
        if (elements.totalCrimes) elements.totalCrimes.textContent = '...';
        if (elements.todayCrimes) elements.todayCrimes.textContent = '...';
        
        // For now, use sample data
        const sampleData = {
            total: 42,
            today: 5,
            lastUpdated: new Date().toISOString(),
            byType: [
                { type: 'theft', count: 15 },
                { type: 'assault', count: 10 },
                { type: 'burglary', count: 8 },
                { type: 'fraud', count: 6 },
                { type: 'vandalism', count: 3 }
            ],
            bySeverity: [
                { severity: 1, count: 5 },
                { severity: 2, count: 15 },
                { severity: 3, count: 12 },
                { severity: 4, count: 7 },
                { severity: 5, count: 3 }
            ]
        };
        
        // Update the dashboard with the sample data
        updateDashboard(sampleData);
        
        // Try to fetch from API in the background
        try {
            const response = await fetch('/api/crime-stats');
            if (response.ok) {
                const data = await response.json();
                updateDashboard(data);
            } else {
                console.warn('Failed to fetch crime stats, using sample data');
            }
        } catch (error) {
            console.warn('Error fetching crime stats, using sample data:', error);
        }
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Error loading dashboard data. Using sample data.', 'warning');
    } finally {
        setLoadingState(false);
    }
}

/**
 * Update the dashboard with crime statistics
 * @param {Object} stats - The crime statistics data
 */
function updateDashboard(stats) {
    console.log('Updating dashboard with stats:', stats);
    
    // Ensure stats is an object
    stats = stats || {};
    
    // Update total crimes
    const totalCrimesElement = document.getElementById('total-crimes');
    if (totalCrimesElement) {
        totalCrimesElement.textContent = stats.totalCrimes || 0;
    }

    // Update today's crimes
    const todayCrimesElement = document.getElementById('today-crimes');
    if (todayCrimesElement) {
        todayCrimesElement.textContent = stats.todayCrimes || 0;
    }
    
    // Update crime type distribution
    if (window.crimeChart) {
        const ctx = document.getElementById('crimeChart').getContext('2d');
        const labels = (stats.byType || []).map(item => item.type);
        const data = (stats.byType || []).map(item => item.count);
        
        window.crimeChart.data.labels = labels;
        window.crimeChart.data.datasets[0].data = data;
        window.crimeChart.update();
    }
    
    // Update severity distribution
    if (window.severityChart) {
        const severityData = (stats.bySeverity || []).sort((a, b) => a.severity - b.severity);
        const labels = severityData.map(item => `Level ${item.severity}`);
        const data = severityData.map(item => item.count);
        
        window.severityChart.data.labels = labels;
        window.severityChart.data.datasets[0].data = data;
        window.severityChart.update();
    }
    
    // Update last updated time
    if (elements.lastUpdated) {
        elements.lastUpdated.textContent = `Last updated: ${formatDate(stats.lastUpdated || new Date())}`;
    }
    
    // Update the chart if we have data
    if (window.crimeChart && stats.byType && stats.byType.length > 0) {
        updateCrimeChart(stats.byType);
    }
    
    // Update the severity distribution if we have the element
    updateSeverityDistribution(stats.bySeverity || []);
    
    // Update the crime type distribution if we have the element
    updateCrimeTypeDistribution(stats.byType || []);
}

/**
 * Update the crime chart with new data
 * @param {Array} crimeData - Array of crime type data
 */
function updateCrimeChart(crimeData) {
    if (!crimeChart || !Array.isArray(crimeData)) return;
    
    const labels = crimeData.map(item => item.type);
    const counts = crimeData.map(item => item.count);
    
    crimeChart.data.labels = labels.map(label => 
        label.charAt(0).toUpperCase() + label.slice(1)
    );
    crimeChart.data.datasets[0].data = counts;
    
    // Update the chart
    crimeChart.update();
}

/**
 * Update the severity distribution display
 * @param {Array} severityData - Array of severity data
 */
function updateSeverityDistribution(severityData) {
    const container = document.getElementById('severity-distribution');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    if (severityData.length === 0) {
        container.innerHTML = '<div class="text-muted">No severity data available</div>';
        return;
    }
    
    // Create a progress bar for each severity level
    severityData.forEach(severity => {
        const severityLevel = severity.severity || 0;
        const count = severity.count || 0;
        const total = severityData.reduce((sum, s) => sum + (s.count || 0), 0);
        const percentage = total > 0 ? (count / total) * 100 : 0;
        
        const severityLabel = `Severity ${severityLevel}`;
        const severityClass = `bg-${getSeverityClass(severityLevel)}`;
        
        const severityElement = document.createElement('div');
        severityElement.className = 'mb-2';
        severityElement.innerHTML = `
            <div class="d-flex justify-content-between small mb-1">
                <span>${severityLabel}</span>
                <span>${count} (${Math.round(percentage)}%)</span>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar ${severityClass}" 
                     role="progressbar" 
                     style="width: ${percentage}%" 
                     aria-valuenow="${percentage}" 
                     aria-valuemin="0" 
                     aria-valuemax="100">
                </div>
            </div>
        `;
        
        container.appendChild(severityElement);
    });
}

/**
 * Update the crime type distribution display
 * @param {Array} crimeData - Array of crime type data
 */
function updateCrimeTypeDistribution(crimeData) {
    const container = document.getElementById('crime-type-distribution');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    if (crimeData.length === 0) {
        container.innerHTML = '<div class="text-muted">No crime type data available</div>';
        return;
    }
    
    // Create a list item for each crime type
    crimeData.forEach(crime => {
        const crimeType = crime.type || 'unknown';
        const count = crime.count || 0;
        const total = crimeData.reduce((sum, c) => sum + (c.count || 0), 0);
        const percentage = total > 0 ? (count / total) * 100 : 0;
        
        const crimeElement = document.createElement('div');
        crimeElement.className = 'd-flex justify-content-between align-items-center py-1';
        crimeElement.innerHTML = `
            <div class="d-flex align-items-center">
                <span class="badge me-2" style="background-color: ${getCrimeColor(crimeType)}; width: 12px; height: 12px; border-radius: 2px;"></span>
                <span>${crimeType.charAt(0).toUpperCase() + crimeType.slice(1)}</span>
            </div>
            <div>
                <span class="fw-medium">${count}</span>
                <small class="text-muted ms-2">${Math.round(percentage)}%</small>
            </div>
        `;
        
        container.appendChild(crimeElement);
    });
}

/**
 * Get the CSS class for a given severity level
 * @param {number} severity - The severity level (1-5)
 * @returns {string} The CSS class for the severity level
 */
function getSeverityClass(severity) {
    switch(parseInt(severity)) {
        case 1: return 'info';
        case 2: return 'success';
        case 3: return 'warning';
        case 4: return 'danger';
        case 5: return 'danger';
        default: return 'secondary';
    }
}

/**
 * Get the color for a crime type
 * @param {string} crimeType - The type of crime
 * @returns {string} The color for the crime type
 */
function getCrimeColor(crimeType) {
    const colors = {
        theft: '#FF6384',
        assault: '#36A2EB',
        burglary: '#FFCE56',
        fraud: '#4BC0C0',
        vandalism: '#9966FF',
        default: '#9CA3AF'
    };
    
    return colors[crimeType] || colors.default;
}

/**
 * Format a date to a readable string
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    if (!date) return 'Never';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid date';
    
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Apply filters to the dashboard
 */
function applyFilters() {
    loadDashboardData();
}

/**
 * Handle map click events when in report mode
 * @param {Object} e - The map click event
 */
function handleMapClickForReport(e) {
    if (!window.crimeMap) return;
    
    // Set the location in the report form
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    
    if (latInput && lngInput) {
        latInput.value = e.latlng.lat;
        lngInput.value = e.latlng.lng;
    }
    
    // Show the report modal
    const reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    reportModal.show();
    
    // Change back to heatmap view
    window.crimeMap.currentView = 'heatmap';
}

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing dashboard...');
    
    try {
        // Initialize the crime distribution chart
        initCrimeChart();
        
        // Show loading state
        setLoadingState(true);
        
        // Load initial data
        loadDashboardData();
        
        // Set up event listeners
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        const dateRangeFilter = document.getElementById('dateRangeFilter');
        const crimeTypeFilter = document.getElementById('crimeTypeFilter');
        const reportForm = document.getElementById('report-form');
        const reportBtn = document.getElementById('report-crime-btn');
        const cancelReportBtn = document.getElementById('cancel-report-btn');
        
        if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
        if (dateRangeFilter) dateRangeFilter.addEventListener('change', applyFilters);
        if (crimeTypeFilter) crimeTypeFilter.addEventListener('change', applyFilters);
        
        // Report crime button click handler
        if (reportBtn) {
            reportBtn.addEventListener('click', () => {
                if (window.crimeMap) {
                    window.crimeMap.currentView = 'report';
                    const reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
                    reportModal.show();
                }
            });
        }
        
        // Cancel report button click handler
        if (cancelReportBtn) {
            cancelReportBtn.addEventListener('click', () => {
                if (window.crimeMap) {
                    window.crimeMap.currentView = 'heatmap';
                    const reportModal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
                    if (reportModal) reportModal.hide();
                }
            });
        }
        
        // Report form submission handler
        if (reportForm) {
            reportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const submitBtn = reportForm.querySelector('button[type="submit"]');
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
                    
                    const formData = new FormData(reportForm);
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
                    showToast('Crime reported successfully!', 'success');
                    
                    // Reset form
                    reportForm.reset();
                    
                    // Close the modal
                    const reportModal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
                    if (reportModal) reportModal.hide();
                    
                    // Refresh the dashboard and map
                    loadDashboardData();
                    if (window.crimeMap && typeof window.crimeMap.loadCrimeData === 'function') {
                        window.crimeMap.loadCrimeData();
                    }
                    
                } catch (error) {
                    console.error('Error reporting crime:', error);
                    showToast(error.message || 'Failed to report crime. Please try again.', 'danger');
                } finally {
                    // Reset button state
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        const btnText = submitBtn.querySelector('.btn-text');
                        const spinner = submitBtn.querySelector('.spinner-border');
                        if (btnText) btnText.textContent = 'Submit Report';
                        if (spinner) spinner.classList.add('d-none');
                    }
                }
            });
        }
        
        // Set up auto-refresh every 5 minutes
        setInterval(loadDashboardData, 5 * 60 * 1000);
        
        console.log('Dashboard initialized');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Failed to initialize dashboard. Please refresh the page.', 'danger');
    }
});

// Make functions available globally for debugging
window.dashboard = {
    loadDashboardData,
    updateDashboard,
    updateCrimeChart,
    showToast,
    applyFilters,
    initCrimeChart
};
