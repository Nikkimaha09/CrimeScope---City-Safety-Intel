let map;
let markers = {};

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Add event listener for form submission
    document.getElementById('reportForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const type = document.getElementById('type').value;
        const location = document.getElementById('location').value;
        const description = document.getElementById('description').value;
        const severity = document.getElementById('severity').value;
        
        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type,
                    location,
                    description,
                    severity: parseInt(severity)
                })
            });
            
            if (response.ok) {
                alert('Crime report submitted successfully!');
                document.getElementById('reportModal').classList.remove('show');
                document.getElementById('reportModal').style.display = 'none';
                
                // Refresh map and statistics
                refreshData();
            } else {
                alert('Error submitting report. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error submitting report. Please try again.');
        }
    });
});

function initMap() {
    // Initialize the map
    map = L.map('map').setView([28.6139, 77.2090], 13); // Default to New Delhi
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add heatmap layer
    const heatmapLayer = L.heat.addTo(map);
    
    // Load initial data
    refreshData();
}

function refreshData() {
    // Fetch crimes and update map
    fetch('/api/crimes')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateMap(data.data);
                updateStatistics();
            }
        });
}

function updateMap(crimes) {
    // Clear existing markers
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    
    // Add new markers
    crimes.forEach(crime => {
        const marker = L.circleMarker([crime.latitude, crime.longitude], {
            radius: 8,
            fillColor: getCrimeColor(crime.type),
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        
        marker.bindPopup(`
            <strong>${crime.type}</strong><br>
            ${new Date(crime.timestamp).toLocaleString()}<br>
            Severity: ${crime.severity}
        `);
        
        markers[crime.id] = marker;
        marker.addTo(map);
    });
}

function updateStatistics() {
    fetch('/api/trends')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const stats = data.stats;
                document.getElementById('today-incidents').textContent = stats.total_crimes;
                document.getElementById('active-hotspots').textContent = stats.hotspots.length;
                
                // Update crime type statistics
                const typeStats = document.getElementById('type-stats');
                if (typeStats) {
                    typeStats.innerHTML = '';
                    Object.entries(stats.by_type).forEach(([type, count]) => {
                        const div = document.createElement('div');
                        div.className = 'stat-item';
                        div.innerHTML = `<span>${type.charAt(0).toUpperCase() + type.slice(1)}:</span> ${count}`;
                        typeStats.appendChild(div);
                    });
                }
            }
        });
}

function getCrimeColor(type) {
    const colors = {
        'theft': '#dc3545',
        'assault': '#ffc107',
        'burglary': '#17a2b8',
        'fraud': '#6f42c1'
    };
    return colors[type] || '#000';
}

// Auto-refresh statistics every 30 seconds
setInterval(refreshData, 30000); // 30 seconds

// Add crime type filter buttons
const crimeTypes = ['theft', 'assault', 'burglary', 'fraud'];
crimeTypes.forEach(type => {
    const button = document.createElement('button');
    button.className = 'btn btn-outline-primary mb-2';
    button.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    button.onclick = () => filterCrimes(type);
    document.getElementById('crime-filters').appendChild(button);
});

function filterCrimes(type) {
    Object.values(markers).forEach(marker => {
        const crimeType = marker.getPopup().getContent().split('<strong>')[1].split('</strong>')[0];
        if (type === 'all' || crimeType === type) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}

// Auto-refresh statistics every 5 minutes
setInterval(updateStatistics, 300000);

// Add crime type filter buttons
const crimeTypes = ['theft', 'assault', 'burglary', 'fraud'];
crimeTypes.forEach(type => {
    const button = document.createElement('button');
    button.className = 'btn btn-outline-primary mb-2';
    button.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    button.onclick = () => filterCrimes(type);
    document.getElementById('crime-filters').appendChild(button);
});

// Add severity filter slider
const severitySlider = document.createElement('input');
severitySlider.type = 'range';
severitySlider.min = '1';
severitySlider.max = '5';
severitySlider.value = '5';
severitySlider.className = 'form-range';
severitySlider.onchange = () => filterBySeverity(severitySlider.value);
document.getElementById('severity-filter').appendChild(severitySlider);

function filterBySeverity(severity) {
    Object.values(markers).forEach(marker => {
        const crimeSeverity = parseInt(marker.getPopup().getContent().split('Severity: ')[1]);
        if (crimeSeverity <= severity) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
}

// Add time filter
const timeFilter = document.createElement('select');
timeFilter.className = 'form-select';
timeFilter.innerHTML = `
    <option value="all">All Time</option>
    <option value="today">Today</option>
    <option value="week">Last 7 Days</option>
    <option value="month">Last 30 Days</option>
`;
timeFilter.onchange = () => filterByTime(timeFilter.value);
document.getElementById('time-filter').appendChild(timeFilter);

function filterByTime(timeRange) {
    fetch(`/api/crimes?timeRange=${timeRange}`)
        .then(response => response.json())
        .then(data => {
            // Clear existing markers
            Object.values(markers).forEach(marker => map.removeLayer(marker));
            
            // Add filtered markers
            addCrimeMarkers(data);
        });
}
