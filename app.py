import io
import sys
import logging
import json
import uuid
import math
import re
import time
import random
import string
import flask
from functools import wraps
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, flash, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename
from google.cloud import firestore
import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore, auth, storage
import google.auth
from google.auth.transport import requests
from google.oauth2 import id_token
from google.auth import jwt
from google.auth.transport.requests import Request as GoogleRequest
import requests as http_requests
from functools import lru_cache
import hashlib
import numpy as np
import math
from simple_predictor import SimpleCrimePredictor
import pandas as pd
from dotenv import load_dotenv
from geopy.distance import geodesic

# Configure logging
class UnicodeReplacer(logging.StreamHandler):
    def emit(self, record):
        try:
            msg = self.format(record)
            # Replace any non-ASCII characters with '?'
            msg = msg.encode('ascii', 'replace').decode('ascii')
            self.stream.write(msg + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log', encoding='utf-8'),
        UnicodeReplacer(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def safe_str(s):
    """Convert string to ASCII, replacing any non-ASCII characters"""
    if s is None:
        return ""
    try:
        if not isinstance(s, str):
            s = str(s)
        # First try ASCII with replacement
        try:
            return s.encode('ascii', 'replace').decode('ascii')
        except (UnicodeEncodeError, UnicodeDecodeError):
            # If that fails, try UTF-8 with replacement
            try:
                return s.encode('utf-8', 'replace').decode('utf-8', 'replace')
            except:
                return "[Error encoding string]"
    except Exception as e:
        return f"[Error processing string: {str(e)}]"

def make_error_response(message, status_code=500, details=None):
    """Create a standardized error response with proper encoding"""
    safe_message = safe_str(message)
    if details:
        safe_details = safe_str(details)
    else:
        safe_details = safe_message
    
    response = jsonify({
        'status': 'error',
        'message': safe_message,
        'details': safe_details
    })
    return response, status_code

# Constants
MAX_ALERT_DISTANCE_KM = 5  # Maximum distance to show alerts (in kilometers)

# Initialize crime predictor
crime_predictor = SimpleCrimePredictor()

# Load environment variables
load_dotenv()

# Initialize Firebase from the service account key file
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.Client()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'  # Change this to a secure secret key

# Configure SocketIO with better settings
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading',
    logger=True,
    engineio_logger=True,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8,  # 100MB
    allow_upgrades=True,
    http_compression=True,
    compression_threshold=1024,
    async_handlers=True,
    always_connect=True
)

# Enable CORS for all routes
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# Set up request logging
@app.before_request
def log_request():
    logger.info(f"Request: {request.method} {request.path} - Params: {request.args}")

@app.after_request
def log_response(response):
    if response.status_code >= 400:
        logger.error(f"Response: {response.status_code} - {response.get_data(as_text=True)[:500]}")
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/crimes')
def get_crimes():
    try:
        crimes_ref = db.collection('crimes')
        crimes = crimes_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(100).stream()
        
        crimes_list = []
        for crime in crimes:
            crime_data = crime.to_dict()
            crime_data['id'] = crime.id
            # Ensure all required fields are present
            if 'latitude' in crime_data and 'longitude' in crime_data:
                crimes_list.append(crime_data)
        
        return jsonify({
            'status': 'success',
            'data': crimes_list
        })
    except Exception as e:
        logger.error(f"Error getting crimes: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


def get_nearest_police_station(lat, lng):
    """Find the nearest police station to the given coordinates"""
    try:
        # This is a simplified example - in a real app, you would query a database of police stations
        # Here we return a default location for demonstration
        return {
            'name': 'Local Police Station',
            'address': '123 Main St, City',
            'phone': '100',
            'latitude': lat + 0.01,  # Simulated nearby location
            'longitude': lng + 0.01,
            'distance_km': 1.2  # Simulated distance
        }
    except Exception as e:
        logger.error(f"Error finding nearest police station: {str(e)}")
        return None

@app.route('/api/report', methods=['POST'])
def report_crime():
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['type', 'severity', 'location', 'description', 'latitude', 'longitude']
        if not all(field in data for field in required_fields):
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields'
            }), 400
        
        # Get current timestamp
        current_time = datetime.utcnow()
        
        # Add to Firestore
        doc_ref = db.collection('crimes').document()
        crime_data = {
            **data,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'status': 'reported',
            'verified': False,
            'reports': 1,
            'location': {
                'latitude': float(data['latitude']),
                'longitude': float(data['longitude'])
            }
        }
        doc_ref.set(crime_data)
        
        # Get updated crime stats
        try:
            # Get all crimes
            crimes_ref = db.collection('crimes')
            crimes = crimes_ref.stream()
            
            # Initialize counters
            stats = {
                'total_crimes': 0,
                'by_type': {},
                'by_severity': {
                    'high': 0,
                    'medium': 0,
                    'low': 0
                },
                'last_updated': datetime.utcnow().isoformat()
            }
            
            # Count crimes by type and severity
            for crime in crimes:
                crime_data = crime.to_dict()
                crime_type = crime_data.get('type', 'other')
                severity = crime_data.get('severity', 'medium').lower()
                
                # Update type count
                if crime_type not in stats['by_type']:
                    stats['by_type'][crime_type] = 0
                stats['by_type'][crime_type] += 1
                
                # Update severity count
                if severity in stats['by_severity']:
                    stats['by_severity'][severity] += 1
                    
                stats['total_crimes'] += 1
            
            # Emit the updated stats via Socket.IO
            socketio.emit('crime_stats_update', {
                'status': 'success',
                'data': stats
            })
            
        except Exception as e:
            logger.error(f"Error getting crime stats: {str(e)}")
            socketio.emit('crime_stats_update', {
                'status': 'error',
                'message': str(e)
            })
        
        # Find nearest police station
        police_station = get_nearest_police_station(
            float(data['latitude']),
            float(data['longitude'])
        )
        
        # Create an alert
        alerts_ref = db.collection('alerts')
        alert_data = {
            'crime_id': crime_ref.id,
            'title': f"{data['type']} reported in {data['location'].split(',')[0]}",
            'description': data['description'],
            'severity': data['severity'],
            'location': data['location'],
            'latitude': float(data['latitude']),
            'longitude': float(data['longitude']),
            'reported_at': current_time,
            'status': 'active',
            'reported_by': data.get('reported_by', 'Anonymous'),
            'police_notified': bool(police_station),
            'police_station': police_station,
            'is_verified': False
        }
        alerts_ref.add(alert_data)
        
        # Send notification to police for high-priority alerts
        if police_station and data['severity'] in ['high', 'critical']:
            try:
                # Get police station contact info
                station_name = police_station.get('name', 'local police station')
                station_email = police_station.get('email', 'police@example.com')
                
                # Prepare email content
                subject = f"{data['severity'].upper()} Priority Alert: {data['type']} in {data['location'].split(',')[0]}"
                message = f"""
                New Crime Alert:
                
                Type: {data['type']}
                Severity: {data['severity']}
                Location: {data['location']}
                Coordinates: {data['latitude']}, {data['longitude']}
                Reported by: {data.get('reported_by', 'Anonymous')}
                Description: {data['description']}
                
                Time: {current_time.strftime('%Y-%m-%d %H:%M:%S')}
                
                Please take appropriate action.
                """
                
                # In a real app, you would send the email here
                logger.info(f"Sending alert to {station_name} ({station_email}): {subject}")
                logger.info(f"Message: {message.strip()}")
                
                # Example of how you might send an email (commented out as it requires email setup)
                """
                import smtplib
                from email.mime.text import MIMEText
                
                msg = MIMEText(message)
                msg['Subject'] = subject
                msg['From'] = 'alerts@crimescope.com'
                msg['To'] = station_email
                
                # Configure your SMTP server details
                with smtplib.SMTP('smtp.example.com', 587) as server:
                    server.starttls()
                    server.login('your_email@example.com', 'your_password')
                    server.send_message(msg)
                """
                
                # Update alert with notification details
                alert_data['police_notified_at'] = datetime.utcnow()
                alert_data['notification_status'] = 'sent'
                
            except Exception as e:
                logger.error(f"Error sending police notification: {str(e)}")
                alert_data['notification_status'] = 'failed'
                alert_data['notification_error'] = str(e)
        
        return jsonify({
            'status': 'success',
            'message': 'Crime reported and alert created successfully',
            'crime_id': crime_ref.id,
            'police_notified': bool(police_station),
            'police_station': police_station
        })
        
    except Exception as e:
        logger.error(f"Error reporting crime: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to report crime',
            'error': str(e)
        }), 500

# Crime type configuration
CRIME_TYPES = {
    'theft': {
        'color': '#dc3545',
        'name': 'Theft',
        'icon': 'fa-bag-shopping'
    },
    'assault': {
        'color': '#ffc107',
        'name': 'Assault',
        'icon': 'fa-user-injured'
    },
    'burglary': {
        'color': '#17a2b8',
        'name': 'Burglary',
        'icon': 'fa-house-crack'
    },
    'vandalism': {
        'color': '#28a745',
        'name': 'Vandalism',
        'icon': 'fa-spray-can-sparkles'
    },
    'fraud': {
        'color': '#6f42c1',
        'name': 'Fraud',
        'icon': 'fa-credit-card'
    },
    'other': {
        'color': '#6c757d',
        'name': 'Other',
        'icon': 'fa-circle-question'
    }
}

@app.route('/api/crime-stats', methods=['GET'])
def get_crime_stats():
    """
    Get crime statistics including counts by type and severity
    Returns data in a format suitable for charts and statistics display.
    """
    try:
        # Default to last 30 days of data
        days = request.args.get('days', default=30, type=int)
        limit = min(request.args.get('limit', default=1000, type=int), 5000)
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Query Firestore for crimes in date range
        crimes_ref = db.collection('crimes')
        query = crimes_ref.where('timestamp', '>=', start_date).limit(limit)
        
        # Execute query
        docs = query.stream()
        
        # Initialize counters for all crime types
        crime_counts = {crime_type: 0 for crime_type in CRIME_TYPES}
        
        # Process results
        total_crimes = 0
        for doc in docs:
            crime = doc.to_dict()
            crime_type = crime.get('type', 'other').lower()
            
            # Use 'other' if crime type is not in our predefined list
            if crime_type not in CRIME_TYPES:
                crime_type = 'other'
                
            crime_counts[crime_type] += 1
            total_crimes += 1
        
        # Prepare data for chart
        chart_data = {
            'labels': [],
            'datasets': [{
                'data': [],
                'backgroundColor': [],
                'borderColor': '#fff',
                'borderWidth': 2
            }]
        }
        
        # Define the desired order of crime types
        crime_type_order = ['theft', 'burglary', 'assault', 'vandalism', 'fraud', 'other']
        
        # Add data for each crime type in the defined order
        for crime_type in crime_type_order:
            if crime_type in crime_counts and crime_counts[crime_type] > 0:
                config = CRIME_TYPES[crime_type]
                chart_data['labels'].append(config['name'])
                chart_data['datasets'][0]['data'].append(crime_counts[crime_type])
                chart_data['datasets'][0]['backgroundColor'].append(config['color'])
        
        # Add any remaining crime types that weren't in our ordered list (shouldn't happen with current setup)
        for crime_type, count in crime_counts.items():
            if crime_type in CRIME_TYPES and CRIME_TYPES[crime_type]['name'] not in chart_data['labels'] and count > 0:
                config = CRIME_TYPES[crime_type]
                chart_data['labels'].append(config['name'])
                chart_data['datasets'][0]['data'].append(count)
                chart_data['datasets'][0]['backgroundColor'].append(config['color'])
        
        # Prepare response
        response = {
            'status': 'success',
            'data': {
                'total_crimes': total_crimes,
                'by_type': crime_counts,
                'chart_data': chart_data,
                'time_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat(),
                    'days': days
                },
                'crime_types': CRIME_TYPES
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        logging.error(f'Error in get_crime_stats: {str(e)}', exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/trends')
def get_trends():
    try:
        # Get query parameters with defaults
        days = request.args.get('days', default=30, type=int)
        limit = min(request.args.get('limit', default=100, type=int), 1000)
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Query Firestore for crimes in date range
        crimes_ref = db.collection('crimes')
        query = crimes_ref.where('timestamp', '>=', start_date).limit(limit)
        
        # Execute query
        docs = query.stream()
        
        # Process results
        crimes = []
        for doc in docs:
            crime = doc.to_dict()
            crime['id'] = doc.id
            crimes.append(crime)
        
        # Calculate basic statistics
        total_crimes = len(crimes)
        
        # Group by crime type
        by_type = {}
        for crime in crimes:
            crime_type = crime.get('type', 'unknown').lower()
            by_type[crime_type] = by_type.get(crime_type, 0) + 1
        
        # Get top 5 crime types
        top_crimes = sorted(by_type.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Calculate hotspots (areas with most crimes)
        locations = {}
        for crime in crimes:
            loc = (crime.get('latitude'), crime.get('longitude'))
            if None not in loc:
                locations[loc] = locations.get(loc, 0) + 1
        
        hotspots = [{'lat': lat, 'lng': lng, 'count': count} 
                   for (lat, lng), count in sorted(locations.items(), 
                                                 key=lambda x: x[1], 
                                                 reverse=True)[:10]]
        
        # Prepare response
        response = {
            'status': 'success',
            'stats': {
                'total_crimes': total_crimes,
                'by_type': by_type,
                'top_crimes': dict(top_crimes),
                'hotspots': hotspots,
                'time_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        logging.error(f'Error in get_trends: {str(e)}', exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/hotspots')
def get_hotspots():
    try:
        # 1. Fetch crimes from the last 30 days
        thirty_days_ago = datetime.now() - timedelta(days=30)
        crimes_ref = db.collection('crimes').where('timestamp', '>=', thirty_days_ago).stream()

        # 2. Group crimes into zones and calculate scores
        hotspots = {}
        for crime in crimes_ref:
            data = crime.to_dict()
            if 'latitude' in data and 'longitude' in data:
                # Create a zone key by truncating coordinates (approx. 110m grid)
                zone_key = f"{round(data['latitude'], 3)},{round(data['longitude'], 3)}"
                
                if zone_key not in hotspots:
                    hotspots[zone_key] = {'count': 0, 'severity_sum': 0, 'lat': round(data['latitude'], 3), 'lng': round(data['longitude'], 3)}
                
                hotspots[zone_key]['count'] += 1
                hotspots[zone_key]['severity_sum'] += data.get('severity', 1)

        # 3. Calculate final hotness score and format output
        hotspot_list = []
        for key, value in hotspots.items():
            if value['count'] > 1: # Only consider zones with more than one crime
                score = value['count'] * (value['severity_sum'] / value['count'])
                hotspot_list.append([value['lat'], value['lng'], score])

        return jsonify({
            'status': 'success',
            'hotspots': hotspot_list
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/safe-route')
def get_safest_route():
    """
    Calculate the safest route between two points, avoiding high-crime areas.
    
    Query Parameters:
    - start_lat: Starting point latitude (required)
    - start_lng: Starting point longitude (required)
    - end_lat: Destination latitude (required)
    - end_lng: Destination longitude (required)
    - mode: Travel mode (driving, walking, cycling) - default: driving
    - safety: Safety level (1-3) where 3 is most cautious - default: 2
    """
    try:
        # Get and validate required parameters
        try:
            start_lat = float(request.args.get('start_lat'))
            start_lng = float(request.args.get('start_lng'))
            end_lat = float(request.args.get('end_lat'))
            end_lng = float(request.args.get('end_lng'))
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'Invalid coordinate values'}), 400
            
        # Get optional parameters with defaults
        mode = request.args.get('mode', 'driving')
        safety_level = min(max(int(request.args.get('safety', 2)), 1), 3)  # Clamp between 1-3
        
        # Validate coordinates
        if not (-90 <= start_lat <= 90 and -90 <= end_lat <= 90 and 
                -180 <= start_lng <= 180 and -180 <= end_lng <= 180):
            return jsonify({'status': 'error', 'message': 'Coordinates out of valid range'}), 400

        # Enhanced crime weights to create stronger barriers
        crime_weights = {
            1: 5000000.0,   # High barrier
            2: 10000000.0,  # Very high barrier
            3: 20000000.0   # Impassable barrier
        }
        
        # Increased danger zones to ensure wider berth around crime areas
        danger_zones = {
            'high': 0.8,     # ~88km radius for high severity crimes
            'medium': 0.5,   # ~55km radius for medium severity
            'low': 0.3       # ~33km radius for low severity
        }
        
        # More aggressive buffer zone
        buffer_zone_multiplier = 6.0
        
        # Increased minimum distance multiplier
        min_distance_multiplier = 30.0  # Force routes to stay very far from crime areas
        
        # Add a larger global danger zone around all crimes
        global_danger_radius = 0.2  # ~22km minimum distance from any crime
        
        # Get recent crimes (last 90 days)
        try:
            logging.info("Fetching recent crimes from database...")
            ninety_days_ago = datetime.now() - timedelta(days=90)
            crimes_ref = db.collection('crimes').where('timestamp', '>=', ninety_days_ago).stream()
            
            # Convert crimes to a list of (lat, lng, weight, radius) tuples
            crime_points = []
            crime_count = 0
            
            # First pass: collect all crimes and calculate severity statistics
            all_severities = []
            for crime in crimes_ref:
                try:
                    crime_data = crime.to_dict()
                    if 'latitude' not in crime_data or 'longitude' not in crime_data:
                        continue
                    all_severities.append(float(crime_data.get('severity', 1)))
                except Exception as e:
                    continue
            
            # Calculate severity percentiles
            if all_severities:
                all_severities.sort()
                low_threshold = np.percentile(all_severities, 33) if len(all_severities) > 3 else 2
                high_threshold = np.percentile(all_severities, 66) if len(all_severities) > 3 else 4
            else:
                low_threshold = 2
                high_threshold = 4
            
            # Reset the crimes reference to iterate again
            crimes_ref = db.collection('crimes').where('timestamp', '>=', ninety_days_ago).stream()
            
            for crime in crimes_ref:
                try:
                    crime_data = crime.to_dict()
                    if 'latitude' not in crime_data or 'longitude' not in crime_data:
                        continue
                        
                    severity = float(crime_data.get('severity', 1))
                    
                    # Determine danger zone radius based on severity
                    if severity >= high_threshold:
                        radius = danger_zones['high']
                    elif severity >= low_threshold:
                        radius = danger_zones['medium']
                    else:
                        radius = danger_zones['low']
                    
                    # Apply safety level multiplier to severity
                    weighted_severity = severity * crime_weights[safety_level]
                    
                    crime_points.append((
                        float(crime_data['latitude']), 
                        float(crime_data['longitude']), 
                        weighted_severity,
                        radius
                    ))
                    crime_count += 1
                except Exception as e:
                    logging.error(f"Error processing crime record {crime.id}: {e}")
                    continue
                    
            logging.info(f"Successfully loaded {crime_count} crime records with severity-based danger zones")
            
        except Exception as e:
            logging.error(f"Error fetching crimes: {e}", exc_info=True)
            # Continue with empty crime points if we can't fetch from database
            crime_points = []
        
        # Generate alternative routes using different OSRM parameters
        alternatives = 2  # Number of alternative routes to consider
        
        # Base OSRM URL with parameters
        osrm_base_url = f"http://router.project-osrm.org/route/v1/{mode}/{start_lng},{start_lat};{end_lng},{end_lat}"
        
        # Try different radiuses to get alternative routes
        radiuses = [5000, 10000, 20000]  # meters
        all_routes = []
        
        for radius in radiuses:
            try:
                # Get route with current radius
                osrm_url = f"{osrm_base_url}?overview=full&geometries=geojson&radiuses={radius};{radius}&alternatives={alternatives}"
                response = http_requests.get(osrm_url, timeout=10)
                response.raise_for_status()
                
                route_data = response.json()
                
                # Process each route
                for i, route in enumerate(route_data.get('routes', [])):
                    geometry = route['geometry']
                    coordinates = geometry['coordinates']
                    
                    # Calculate danger score for this route
                    danger_score = 0
                    segment_penalties = [0] * (len(coordinates) - 1)  # Track danger per segment
                    
                    for crime_lat, crime_lng, severity, radius in crime_points:
                        crime_point = (crime_lat, crime_lng)
                        
                        # Check distance to each segment of the route
                        for j in range(len(coordinates) - 1):
                            p1 = (coordinates[j][1], coordinates[j][0])  # lat, lng
                            p2 = (coordinates[j+1][1], coordinates[j+1][0])
                            
                            # Calculate distance from crime to this segment in kilometers
                            dist = point_to_segment_dist(crime_point, p1, p2) * 111.32  # Convert to km
                    
                            # Absolute barrier - any route through immediate crime areas is rejected
                            if dist <= radius * 1.2:  # Increased from 1.0 to 1.2 for larger avoidance
                                segment_penalties[j] = float('inf')
                                break
                                
                            # Apply a global minimum distance penalty to all crimes
                            if dist < global_danger_radius * 1.5:  # Increased safety margin
                                segment_penalties[j] = float('inf')
                                break
                            
                            # Enhanced danger zone calculation with exponential falloff
                            if dist <= radius * buffer_zone_multiplier * 1.2:  # Slightly larger buffer
                                # Calculate distance ratio with better numerical stability
                                distance_ratio = max(0, (dist - radius) / (radius * (buffer_zone_multiplier - 1)))
                                
                                # Use exponential decay for more natural falloff
                                falloff = math.exp(-4.0 * distance_ratio)
                                
                                # Get crime severity with better defaults
                                current_severity = crime_point[2] if len(crime_point) > 2 else 'medium'
                                
                                # Enhanced severity scaling - makes high severity crimes much more impactful
                                severity_weights = {
                                    'high': 30.0,    # Increased from 20.0
                                    'medium': 12.0,  # Increased from 10.0
                                    'low': 6.0       # Increased from 5.0
                                }
                                severity_multiplier = severity_weights.get(current_severity, 1.0)
                                
                                # Higher base penalty
                                base_penalty = 15000000.0  # Increased from 10,000,000
                                
                                # More aggressive distance-based penalty
                                distance_penalty = (1.0 / (dist ** 0.7 + 0.0001)) * min_distance_multiplier * 2000
                                
                                # Calculate total penalty with exponential falloff and severity scaling
                                total_penalty = (base_penalty * falloff * severity_multiplier) + distance_penalty
                                
                                # Apply the penalty to the segment
                                segment_penalties[j] += total_penalty
                                
                                # Create a larger avoidance zone for high-severity crimes
                                if current_severity == 'high' and dist < radius * 1.8:  # Increased from 1.5
                                    segment_penalties[j] = float('inf')
                                    break
                                    
                                # Reject any segment that comes too close to any crime
                                if dist < radius * 0.7:  # Increased from 0.5
                                    segment_penalties = [float('inf')] * len(segment_penalties)
                                    break
                    
                    # Calculate total danger score with non-linear scaling
                    # This makes routes with any high-danger segments much less desirable
                    danger_score = sum(penalty ** 2 for penalty in segment_penalties) ** 0.5
                    
                    # Store route with its score and segment penalties
                    all_routes.append({
                        'geometry': geometry,
                        'distance': route['distance'],  # meters
                        'duration': route['duration'],  # seconds
                        'danger_score': danger_score,
                        'coordinates': coordinates,
                        'segment_penalties': segment_penalties  # Store segment penalties for scoring
                    })
                    
            except (http_requests.RequestException, ValueError) as e:
                logging.warning(f"Failed to get route with radius {radius}m: {e}")
                continue
        
        if not all_routes:
            return jsonify({'status': 'error', 'message': 'No valid routes found'}), 404
        
        # Enhanced route scoring that strongly prioritizes safety
        def route_score(route):
            segment_penalties = route.get('segment_penalties', [])
            
            # Reject any route that comes too close to any crime
            if any(isinstance(p, (int, float)) and not math.isfinite(p) for p in segment_penalties):
                return float('inf')
            
            # Enhanced danger metrics with higher sensitivity
            max_danger = 0
            danger_zones = 0
            danger_score = 0
            
            for penalty in segment_penalties:
                # Use a more aggressive exponential scale with higher sensitivity
                weighted_penalty = math.exp(penalty * 0.00015)  # Increased from 0.0001
                max_danger = max(max_danger, weighted_penalty)
                
                # Lower threshold for considering a segment dangerous
                if penalty > 50:  # Reduced from 100 to be more cautious
                    danger_zones += 1
                
                # Apply non-linear scaling to heavily penalize high-danger segments
                danger_score += (weighted_penalty ** 1.5) * 15  # More aggressive scaling
                
                # Add extra penalty for consecutive dangerous segments
                if penalty > 1000 and len(segment_penalties) > 1:
                    danger_score *= 1.2
            
            # Safety multipliers - extremely high to ensure safety is the primary factor
            safety_multiplier = {
                1: 1e6,    # High safety priority
                2: 1e8,    # Very high safety priority
                3: 1e10    # Extreme safety priority - will avoid crimes at all costs
            }.get(safety_level, 1e6)
            
            # If there's any significant danger, distance becomes irrelevant
            if max_danger > 0:
                return (max_danger * 1e6) + (danger_zones * 1e8) + danger_score
            
            # Only consider distance if the route is completely safe
            max_dist = max(max(r['distance'] for r in all_routes), 1)
            norm_dist = (route['distance'] / max_dist) * 0.0001  # Minimal weight for distance
            
            return (danger_score * safety_multiplier) + norm_dist
        
        # Sort routes by score (ascending - lower is better)
        best_route = min(all_routes, key=route_score)
        
        # Convert Infinity to large numbers for JSON serialization
        def replace_infinity(obj):
            if isinstance(obj, float) and (obj == float('inf') or obj == float('-inf')):
                return 1e10 if obj > 0 else -1e10
            elif isinstance(obj, dict):
                return {k: replace_infinity(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_infinity(item) for item in obj]
            return obj
            
        # Prepare response data with Infinity values replaced
        response_data = {
            'status': 'success',
            'type': 'Feature',
            'properties': {
                'distance': best_route['distance'],
                'duration': best_route['duration'],
                'danger_score': best_route['danger_score'],
                'safety_level': safety_level
            },
            'geometry': best_route['geometry']
        }
        
        # Replace any Infinity values in the response
        response_data = replace_infinity(response_data)
        
        return jsonify(response_data)

    except http_requests.RequestException as e:
        logging.error(f"Routing API error: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': 'Failed to calculate route. Please try again.',
            'details': str(e)
        }), 502
    except Exception as e:
        logging.error(f"Unexpected error in safe route calculation: {e}", exc_info=True)
        return jsonify({
            'status': 'error', 
            'message': 'An unexpected error occurred',
            'details': str(e)
        }), 500

def point_to_segment_dist(p, a, b):
    px = b[1] - a[1]
    py = b[0] - a[0]
    norm = px*px + py*py
    u = ((p[1] - a[1]) * px + (p[0] - a[0]) * py) / float(norm) if norm != 0 else 0
    u = max(0, min(1, u))
    x = a[1] + u * px
    y = a[0] + u * py
    dx = x - p[1]
    dy = y - p[0]
    return math.sqrt(dx*dx + dy*dy)

@app.route('/api/predict/hotzones', methods=['GET'])
def predict_hotzones():
    try:
        # Get query parameters with validation
        method = request.args.get('method', 'arima').lower()
        if method not in ['arima', 'lstm', 'prophet']:
            method = 'arima'
            
        try:
            days = max(1, min(int(request.args.get('days', 7)), 30))  # Limit to 1-30 days
        except (ValueError, TypeError):
            days = 7
        
        # Get recent crimes with error handling
        try:
            from datetime import datetime, timedelta
            import math
            import random
            
            # Get crimes from the last 90 days
            ninety_days_ago = datetime.utcnow() - timedelta(days=90)
            crimes_ref = db.collection('crimes')
            crimes_query = crimes_ref.where('timestamp', '>=', ninety_days_ago)
            crimes = crimes_query.stream()
            
            # Convert to list of dicts with validation
            crimes_list = []
            for crime in crimes:
                try:
                    crime_data = crime.to_dict()
                    crime_data['id'] = crime.id
                    
                    # Ensure required fields exist and are valid
                    if all(field in crime_data for field in ['timestamp', 'latitude', 'longitude', 'severity']):
                        # Convert Firestore timestamp to datetime if needed
                        if hasattr(crime_data['timestamp'], 'to_pydatetime'):
                            crime_data['timestamp'] = crime_data['timestamp'].to_pydatetime()
                        
                        # Add additional processing for prediction features
                        crime_data['day_of_week'] = crime_data['timestamp'].weekday()
                        crime_data['hour_of_day'] = crime_data['timestamp'].hour
                        crime_data['month'] = crime_data['timestamp'].month
                        
                        # Add severity score (1-5, higher is more severe)
                        severity_map = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
                        crime_data['severity_score'] = severity_map.get(crime_data.get('severity', 'low').lower(), 1)
                        
                        crimes_list.append(crime_data)
                except Exception as e:
                    logger.warning(f"Error processing crime {crime.id}: {str(e)}")
                    continue
            
            if not crimes_list:
                logger.warning("No valid crime data found for prediction")
                return jsonify({
                    'status': 'success',
                    'data': [],
                    'message': 'No recent crime data available for prediction'
                })
            
            # Generate predictions (mock implementation - replace with actual ML model)
            predictions = []
            today = datetime.utcnow().date()
            
            # Generate predictions for each of the next 'days' days
            for day_offset in range(1, days + 1):
                prediction_date = today + timedelta(days=day_offset)
                
                # Sample prediction logic - replace with actual model prediction
                for _ in range(random.randint(3, 10)):  # 3-10 hotzones per day
                    # Get a random crime location as base
                    base_crime = random.choice(crimes_list)
                    
                    # Add some randomness to create hotzones
                    lat = base_crime['latitude'] + (random.random() * 0.02 - 0.01)
                    lng = base_crime['longitude'] + (random.random() * 0.02 - 0.01)
                    risk_score = min(1.0, base_crime['severity_score'] * 0.2 + random.random() * 0.3)
                    predicted_crimes = int(base_crime['severity_score'] * (1 + random.random()) * 2)
                    
                    predictions.append({
                        'date': prediction_date.strftime('%Y-%m-%d'),
                        'latitude': lat,
                        'longitude': lng,
                        'risk_score': round(risk_score, 2),
                        'predicted_crimes': predicted_crimes,
                        'is_high_risk': risk_score > 0.6,
                        'crime_types': [base_crime.get('type', 'unknown')],
                        'confidence': round(random.uniform(0.7, 0.95), 2)
                    })
            
            return jsonify({
                'status': 'success',
                'data': predictions,
                'metadata': {
                    'total_predictions': len(predictions),
                    'prediction_days': days,
                    'method': method,
                    'generated_at': datetime.utcnow().isoformat()
                }
            })
            
        except Exception as e:
            logger.error(f"Error generating predictions: {str(e)}", exc_info=True)
            return jsonify({
                'status': 'error',
                'message': f'Failed to generate predictions: {str(e)}',
                'data': []
            }), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in predict_hotzones: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred while processing your request',
            'details': str(e)
        }), 500

@app.route('/predictions')
def predictions():
    return render_template('predictions.html')

@app.route('/alerts')
def alerts():
    return render_template('alerts.html')

# Test route to verify static file serving
@app.route('/test-static')
def test_static():
    return app.send_static_file('js/alerts.js')

@app.route('/static-files')
def list_static_files():
    import os
    static_dir = os.path.join(app.root_path, 'static')
    files = []
    
    for root, dirs, filenames in os.walk(static_dir):
        for filename in filenames:
            path = os.path.join(root, filename)
            rel_path = os.path.relpath(path, static_dir)
            files.append(rel_path.replace('\\', '/'))
    
    return jsonify({
        'static_dir': static_dir,
        'files': files
    })

@app.route('/debug')
def debug():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Debug Page</title>
        <script>
            // Test if JavaScript is working
            document.addEventListener('DOMContentLoaded', function() {
                console.log('Debug page loaded');
                document.getElementById('status').textContent = 'JavaScript is working!';
                
                // Test if we can load alerts.js
                const script = document.createElement('script');
                script.src = '/static/js/alerts.js';
                script.onload = function() {
                    console.log('alerts.js loaded successfully');
                    document.getElementById('alerts-status').textContent = 'alerts.js loaded successfully';
                };
                script.onerror = function() {
                    console.error('Failed to load alerts.js');
                    document.getElementById('alerts-status').textContent = 'Failed to load alerts.js';
                };
                document.head.appendChild(script);
            });
        </script>
    </head>
    <body>
        <h1>Debug Page</h1>
        <div>JavaScript Status: <span id="status">Loading...</span></div>
        <div>alerts.js Status: <span id="alerts-status">Loading...</span></div>
        <div>Check browser console for more details.</div>
    </body>
    </html>
    """

# Community Alert Endpoints
@app.route('/api/alerts', methods=['POST'])
def create_alert():
    try:
        data = request.json
        required_fields = ['title', 'description', 'latitude', 'longitude']
        
        if not all(field in data for field in required_fields):
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields'
            }), 400
            
        # Add timestamp and default status
        alert_data = {
            'title': data['title'],
            'description': data['description'],
            'latitude': float(data['latitude']),
            'longitude': float(data['longitude']),
            'created_at': firestore.SERVER_TIMESTAMP,
            'status': 'active',
            'reported_by': data.get('reported_by', 'Anonymous'),
            'category': data.get('category', 'general'),
            'severity': data.get('severity', 'medium')
        }
        
        # Add to Firestore
        alert_ref = db.collection('alerts').document()
        alert_data['id'] = alert_ref.id  # Add ID to the data before saving
        alert_ref.set(alert_data)
        
        # Create response data without the SERVER_TIMESTAMP sentinel
        response_data = {
            'id': alert_ref.id,
            'title': alert_data['title'],
            'description': alert_data['description'],
            'latitude': alert_data['latitude'],
            'longitude': alert_data['longitude'],
            'status': alert_data['status'],
            'reported_by': alert_data['reported_by'],
            'category': alert_data['category'],
            'severity': alert_data['severity'],
            'created_at': datetime.utcnow().isoformat()
        }
        
        try:
            # Broadcast the new alert to all connected clients
            socketio.emit('new_alert', {
                'status': 'success',
                'data': response_data,
                'timestamp': datetime.utcnow().isoformat()
            }, namespace='/')
            logging.info(f'Broadcasted new alert {alert_ref.id} to all connected clients')
            
        except Exception as e:
            logging.error(f'Error broadcasting new alert: {str(e)}')
            # Don't fail the request if broadcasting fails
        
        return jsonify({
            'status': 'success',
            'data': response_data
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    print("\n=== GET /api/alerts ===")
    try:
        # Get query parameters with validation
        try:
            status = request.args.get('status', 'active')
            limit = int(request.args.get('limit', 50))
            if limit > 100:  # Prevent excessive data loading
                limit = 100
        except ValueError as e:
            print(f"Invalid query parameters: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid query parameters',
                'details': str(e)
            }), 400

        print(f"Fetching up to {limit} alerts with status: {status}")
        
        try:
            # Initialize Firestore query - get all documents first
            alerts_ref = db.collection('alerts')
            print("1. Connected to Firestore collection")
            
            # Execute query and process all results
            print("2. Fetching all alerts...")
            all_docs = list(alerts_ref.stream())
            print(f"3. Found {len(all_docs)} total alerts")
            
            # Process and filter alerts in memory
            alerts = []
            for doc in all_docs:
                try:
                    alert = doc.to_dict()
                    alert['id'] = doc.id
                    
                    # Skip if status doesn't match
                    if status and alert.get('status') != status:
                        continue
                    
                    # Convert Firestore timestamp to ISO format if it exists
                    if 'created_at' in alert:
                        try:
                            if hasattr(alert['created_at'], 'isoformat'):
                                alert['created_at'] = alert['created_at'].isoformat()
                            elif hasattr(alert['created_at'], 'timestamp'):
                                from datetime import datetime
                                alert['created_at'] = datetime.fromtimestamp(
                                    alert['created_at'].timestamp()
                                ).isoformat()
                        except Exception as e:
                            print(f"Warning: Error formatting timestamp: {safe_str(str(e))}")
                            alert['created_at'] = None
                    
                    alerts.append(alert)
                    
                except Exception as e:
                    print(f"Error processing document {doc.id}: {safe_str(str(e))}")
                    continue
            
            # Sort by created_at in memory
            try:
                alerts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
                print("4. Sorted alerts by created_at")
            except Exception as e:
                print(f"Warning: Could not sort by created_at: {str(e)}")
            
            # Apply limit
            alerts = alerts[:limit]
            print(f"5. Applied limit: {len(alerts)} alerts")
            
            print(f"7. Successfully processed {len(alerts)} alerts")
            return jsonify({
                'status': 'success',
                'data': alerts,  # Ensure consistent format with get_nearby_alerts
                'count': len(alerts)
            })
            
        except Exception as e:
            error_msg = f"Database error: {safe_str(str(e))}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            return jsonify({
                'status': 'error',
                'message': 'Error retrieving alerts from database',
                'details': safe_str(str(e))
            }), 500
            
    except Exception as e:
        error_msg = f"Unexpected error: {safe_str(str(e))}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred',
            'details': safe_str(str(e))
        }), 500

@app.route('/api/test-firestore', methods=['GET'])
def test_firestore():
    """Test endpoint to verify Firestore connection"""
    try:
        print("\n" + "="*80)
        print("=== TESTING FIRESTORE CONNECTION ===")
        print("="*80)
        
        print("\n1. Getting Firestore client...")
        db_test = firestore.Client()
        print("   [OK] Got Firestore client")
        
        # Print environment info
        print("\nEnvironment Info:")
        print(f"  Python: {sys.version}")
        print(f"  Flask: {flask.__version__}")
        print(f"  Firebase Admin: {firebase_admin.__version__ if 'firebase_admin' in sys.modules else 'Not available'}")
        
        print("2. Listing collections...")
        collections = list(db_test.collections())
        collection_list = [col.id for col in collections]
        print(f"   [OK] Found collections: {collection_list}")
        
        # Test reading from alerts collection
        print("3. Testing alerts collection...")
        alerts_ref = db.collection('alerts')
        alerts = []
        
        # Get all alerts
        docs = list(alerts_ref.stream())
        print(f"   [OK] Found {len(docs)} alerts in collection")
        
        for doc in docs:
            try:
                alert = doc.to_dict()
                alert['id'] = doc.id
                alerts.append(alert)
            except Exception as e:
                print(f"   [ERROR] Error processing document {doc.id}: {str(e)}")
                continue
        
        # Sort by created_at, converting all to timestamps for consistent comparison
        def get_timestamp(dt):
            if hasattr(dt, 'timestamp'):  # Handle datetime objects
                return dt.timestamp()
            try:
                # Try to parse string dates
                from datetime import datetime
                if isinstance(dt, str):
                    return datetime.fromisoformat(dt.replace('Z', '+00:00')).timestamp()
            except (ValueError, AttributeError):
                pass
            return 0  # Fallback for invalid dates
            
        alerts.sort(key=lambda x: get_timestamp(x.get('created_at')), reverse=True)
        
        # Print detailed information for debugging
        print(f"\n=== Firestore Test Results ===")
        print(f"Found {len(collections)} collections: {collection_list}")
        print(f"Found {len(alerts)} alerts in 'alerts' collection")
        
        # Print sample documents with types for debugging
        print("\nSample alerts (first 3):")
        for i, alert in enumerate(alerts[:3]):
            print(f"\nAlert {i+1}:")
            for k, v in alert.items():
                value_type = type(v).__name__
                print(f"  {k} ({value_type}): {v}")
        
        # Prepare response with first 5 alerts
        response_alerts = []
        for alert in alerts[:5]:
            alert_data = {}
            for k, v in alert.items():
                # Convert datetime objects to ISO format strings
                if hasattr(v, 'isoformat'):
                    alert_data[k] = v.isoformat()
                else:
                    alert_data[k] = v
            response_alerts.append(alert_data)
            
        return jsonify({
            'status': 'success',
            'message': 'Firestore connection test completed successfully',
            'collections': collection_list,
            'alerts_count': len(alerts),
            'alerts': response_alerts,
            'server_time': datetime.now().isoformat()
        })
            
    except Exception as e:
        error_msg = f"Firestore test failed: {str(e)}"
        print(f"\n[ERROR] {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': 'Error testing Firestore connection',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/alerts/nearby', methods=['GET'])
def get_nearby_alerts():
    """
    Get nearby crime alerts within a specified radius of given coordinates.
    
    Query Parameters:
    - lat: Latitude (required)
    - lng: Longitude (required)
    - radius: Search radius in kilometers (default: 5)
    - limit: Maximum number of results to return (default: 20, max: 100)
    """
    logger = logging.getLogger('alerts')
    logger.setLevel(logging.DEBUG)  # Set to DEBUG for more verbose logging
    
    # Log all request headers and parameters for debugging
    logger.debug(f"Request headers: {dict(request.headers)}")
    logger.debug(f"Request args: {request.args}")
    
    try:
        # Get and validate parameters
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        radius = request.args.get('radius', 5, type=float)
        limit = min(int(request.args.get('limit', 20)), 100)  # Cap limit at 100 for performance
        
        # Log request details
        logger.info(f"Request - lat: {lat} (type: {type(lat)}), lng: {lng} (type: {type(lng)}), radius: {radius}km, limit: {limit}")
        
        # Debug: Log the raw request URL
        logger.debug(f"Request URL: {request.url}")
        
        # Validate inputs with detailed error messages
        if lat is None or lng is None:
            error_msg = f"Missing required parameters. Got lat: {lat}, lng: {lng}"
            logger.error(error_msg)
            return jsonify({
                'status': 'error',
                'message': 'Missing required parameters',
                'details': error_msg,
                'required_parameters': ['lat', 'lng'],
                'received': {'lat': lat, 'lng': lng}
            }), 400
            
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            error_msg = f"Invalid coordinates. lat must be between -90 and 90, lng between -180 and 180. Got lat: {lat}, lng: {lng}"
            logger.error(error_msg)
            return jsonify({
                'status': 'error',
                'message': 'Invalid coordinates',
                'details': error_msg,
                'valid_range': {'lat': [-90, 90], 'lng': [-180, 180]},
                'received': {'lat': lat, 'lng': lng}
            }), 400
            
        if radius <= 0 or limit <= 0:
            error_msg = f"Radius and limit must be positive. Got radius: {radius}, limit: {limit}"
            logger.error(error_msg)
            return jsonify({
                'status': 'error',
                'message': 'Invalid parameters',
                'details': error_msg,
                'requirements': {'radius': '> 0', 'limit': '> 0'},
                'received': {'radius': radius, 'limit': limit}
            }), 400
            
        # Initialize Firestore
        db = firestore.Client()
        alerts_ref = db.collection('alerts').where('status', '==', 'active')
        
        # Process alerts
        alerts = []
        for doc in alerts_ref.stream():
            try:
                alert = doc.to_dict()
                if 'latitude' not in alert or 'longitude' not in alert:
                    continue
                    
                # Calculate distance using Haversine formula
                try:
                    alert_lat, alert_lng = float(alert['latitude']), float(alert['longitude'])
                    lat1, lng1 = radians(lat), radians(lng)
                    lat2, lng2 = radians(alert_lat), radians(alert_lng)
                    dlat, dlng = lat2 - lat1, lng2 - lng1
                    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
                    distance = 6371 * 2 * atan2(sqrt(a), sqrt(1-a))  # Earth's radius in km
                    
                    if distance <= radius:
                        # Format the alert data
                        formatted_alert = {
                            'id': doc.id,
                            'distance': round(distance, 2),
                            **alert  # Include all original alert fields
                        }
                        
                        # Format timestamp if it exists
                        if 'created_at' in alert and hasattr(alert['created_at'], 'isoformat'):
                            formatted_alert['created_at'] = alert['created_at'].isoformat()
                        
                        alerts.append(formatted_alert)
                        
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping alert {doc.id} due to invalid coordinates: {e}")
                    continue
                    
            except Exception as e:
                logger.error(f"Error processing alert {doc.id}: {str(e)}")
                continue
        
        # Sort by distance and limit results
        alerts.sort(key=lambda x: x.get('distance', float('inf')))
        alerts = alerts[:limit]
        
        return jsonify({
            'status': 'success',
            'count': len(alerts),
            'data': alerts
        })
        
    except Exception as e:
        error_msg = f"Unexpected error in get_nearby_alerts: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return jsonify({
            'status': 'error',
            'message': 'Failed to fetch nearby alerts',
            'error': str(e)
        }), 500

# Geocoding endpoint
@app.route('/api/geocode/reverse', methods=['GET'])
def reverse_geocode():
    """
    Reverse geocode coordinates to get address information.
    This acts as a proxy to Nominatim with proper rate limiting.
    """
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        
        if not lat or not lon:
            return jsonify({'status': 'error', 'message': 'Missing lat/lon parameters'}), 400
            
        # Validate coordinates
        try:
            lat_float = float(lat)
            lon_float = float(lon)
            if not (-90 <= lat_float <= 90 and -180 <= lon_float <= 180):
                raise ValueError("Coordinates out of range")
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid coordinate values'}), 400
        
        # Set up headers to identify our application
        headers = {
            'User-Agent': 'CrimeScope/1.0 (contact@crimescope.example.com)',
            'Referer': 'http://localhost:8000'
        }
        
        # Make request to Nominatim
        url = f'https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&addressdetails=1'
        response = http_requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Return the response from Nominatim
        return jsonify(response.json())
        
    except http_requests.RequestException as e:
        logging.error(f"Geocoding error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to geocode location',
            'details': str(e)
        }), 500
    except Exception as e:
        logging.error(f"Unexpected error in geocoding: {e}")
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred',
            'details': str(e)
        }), 500

# WebSocket event handlers
@socketio.on('connect')
def handle_connect():
    """Handle new WebSocket connections with client authentication and logging."""
    client_id = request.sid
    client_ip = request.remote_addr
    
    # Log the connection attempt
    logging.info(f'Client connected - ID: {client_id}, IP: {client_ip}, Headers: {dict(request.headers)}')
    
    try:
        # Store client information in the socket's session
        session['connected_at'] = datetime.utcnow().isoformat()
        session['client_ip'] = client_ip
        
        # Acknowledge connection with server info
        emit('connection_response', {
            'status': 'success',
            'message': 'Connected to CrimeScope WebSocket',
            'server_time': datetime.utcnow().isoformat(),
            'max_alert_distance_km': MAX_ALERT_DISTANCE_KM,
            'features': ['realtime_alerts', 'location_updates', 'alert_notifications']
        })
        
        logging.info(f'Successfully established WebSocket connection with {client_id}')
        
    except Exception as e:
        logging.error(f'Error during WebSocket connection: {str(e)}')
        emit('connection_response', {
            'status': 'error',
            'message': 'Failed to initialize WebSocket connection',
            'error': str(e)
        })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection with cleanup."""
    client_id = request.sid
    connection_duration = 'unknown'
    
    try:
        # Calculate connection duration if we have the connect time
        if 'connected_at' in session:
            connected_at = datetime.fromisoformat(session['connected_at'])
            connection_duration = str(datetime.utcnow() - connected_at)
        
        logging.info(f'Client disconnected - ID: {client_id}, Duration: {connection_duration}')
        
    except Exception as e:
        logging.error(f'Error during WebSocket disconnection: {str(e)}')

@socketio.on('ping')
def handle_ping(data=None):
    """Handle ping/pong for connection health monitoring."""
    try:
        client_timestamp = data.get('timestamp') if isinstance(data, dict) else None
        
        emit('pong', {
            'server_time': datetime.utcnow().isoformat() + 'Z',
            'latency': (datetime.utcnow() - datetime.fromisoformat(data['client_time'].replace('Z', ''))).total_seconds() * 1000
        })
    except Exception as e:
        logging.error(f'Error in ping handler: {e}')
        try:
            emit('pong', {'error': 'Internal server error'})
        except:
            logging.error('Failed to send error response in ping handler')

@socketio.on('sync')
def handle_sync(data):
    """Synchronize client with latest alerts and updates."""
    if not isinstance(data, dict):
        data = {}
    
    client_id = request.sid
    last_sync = data.get('lastSync')
    location = data.get('location')
    
    try:
        logging.info(f'Sync request from {client_id} - Last sync: {last_sync}')
        
        # Build the base query
        alerts_ref = db.collection('alerts')
        
        # Add timestamp filter if provided
        if last_sync:
            try:
                # Convert string timestamp to datetime if needed
                if isinstance(last_sync, str):
                    last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                alerts_ref = alerts_ref.where('timestamp', '>', last_sync)
            except (ValueError, TypeError) as e:
                logging.warning(f'Invalid lastSync timestamp: {last_sync}, error: {str(e)}')
        
        # Execute the query
        alerts = []
        for doc in alerts_ref.stream():
            alert = doc.to_dict()
            alert['id'] = doc.id
            
            # Add distance if location is provided
            if location and 'latitude' in alert and 'longitude' in alert:
                try:
                    alert_loc = (alert['latitude'], alert['longitude'])
                    client_loc = (float(location['lat']), float(location['lng']))
                    alert['distance_km'] = round(geodesic(client_loc, alert_loc).kilometers, 2)
                except (ValueError, KeyError) as e:
                    logging.warning(f'Error calculating distance for alert {doc.id}: {str(e)}')
            
            alerts.append(alert)
        
        # Sort by timestamp (newest first)
        alerts.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        # Limit number of alerts to prevent overwhelming the client
        max_alerts = min(int(data.get('limit', 50)), 100)
        alerts = alerts[:max_alerts]
        
        # Prepare response
        response = {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'alerts': alerts,
            'count': len(alerts)
        }
        
        emit('sync_response', response)
        logging.info(f'Sent {len(alerts)} alerts to {client_id}')
        
    except Exception as e:
        error_msg = f'Error syncing alerts: {str(e)}'
        logging.error(error_msg, exc_info=True)
        emit('sync_response', {
            'status': 'error',
            'message': 'Failed to sync alerts',
            'error': error_msg
        })
        emit('error', {'message': 'Failed to sync alerts'})

if __name__ == '__main__':
    print("Starting CrimeScope server with WebSocket support on http://127.0.0.1:8000")
    socketio.run(app, debug=True, host='127.0.0.1', port=8000, allow_unsafe_werkzeug=True)
