import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta
import random
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the path to the service account key from environment variable
service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')

if not service_account_path:
    raise ValueError("GOOGLE_APPLICATION_CREDENTIALS environment variable not set")

# Initialize Firebase
cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

# Sample crime types and their weights (for random selection)
CRIME_TYPES = [
    ("theft", 0.35), 
    ("assault", 0.25), 
    ("burglary", 0.2), 
    ("vandalism", 0.15), 
    ("fraud", 0.05)
]

# Sample locations in Hyderabad
LOCATIONS = [
    (17.3850, 78.4867, "Hitech City"),
    (17.4065, 78.4772, "Gachibowli"),
    (17.4474, 78.3762, "Secunderabad"),
    (17.4239, 78.4738, "Madhapur"),
    (17.3616, 78.4747, "Banjara Hills"),
    (17.4375, 78.4482, "Kukatpally"),
    (17.4126, 78.4970, "Jubilee Hills"),
    (17.4399, 78.4983, "Miyapur")
]

def get_random_date(days_back=30):
    """Generate a random datetime within the last N days"""
    now = datetime.now()
    random_days = random.randint(0, days_back)
    random_seconds = random.randint(0, 86400)  # 86400 seconds in a day
    return now - timedelta(days=random_days, seconds=random_seconds)9vt+N3VcPT+/eMm1GztHTD7hiz9BHuwNX7Er3vjt53Z6n4NEU\njNvh8tuzCBziNGCt2Nxp+Y2Ls6wOyoOl5xjGD45NUydssb7uUMzkQ5YhXFYD57+h\n4eoZfGTBrfeckOAIsF5vAFnv\n-----END PRIVATE KEY-----",
    "client_email": "firebase-adminsdk-fbsvc@crimescope-61702.iam.gserviceaccount.com",
    "client_id": "YOUR_CLIENT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40crimescope-61702.iam.gserviceaccount.com"
})

firebase_admin.initialize_app(cred)
db = firestore.client()

# Sample crime types and their severity
crime_types = {
    'theft': 2,
    'assault': 4,
    'burglary': 3,
    'vandalism': 2,
    'fraud': 1
}

def add_sample_data():
    # New Delhi coordinates (approximate center)
    center_lat, center_lng = 28.6139, 77.2090
    
    # Add 20 sample crimes
    for i in range(20):
        # Generate random coordinates around center
        lat = center_lat + (random.random() - 0.5) * 0.1
        lng = center_lng + (random.random() - 0.5) * 0.1
        
        # Random crime type
        crime_type = random.choice(list(crime_types.keys()))
        
        # Create crime document
        crime_data = {
            'type': crime_type,
            'severity': crime_types[crime_type],
            'latitude': lat,
            'longitude': lng,
            'location': f"{lat}, {lng}",
            'description': f'Sample {crime_type} incident {i+1}',
            'timestamp': firestore.SERVER_TIMESTAMP,
            'status': 'Reported'
        }
        
        # Add to Firestore
        db.collection('crimes').add(crime_data)
        print(f"Added {crime_type} at {lat:.4f}, {lng:.4f}")

if __name__ == '__main__':
    print("Adding sample crime data...")
    add_sample_data()
    print("Done adding sample data!")
