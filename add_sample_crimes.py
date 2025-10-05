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
    return now - timedelta(days=random_days, seconds=random_seconds)

def add_sample_data(num_entries=50):
    """Add sample crime data to Firestore"""
    crimes_ref = db.collection('crimes')
    
    for _ in range(num_entries):
        # Select a random crime type based on weights
        crime_type = random.choices(
            [crime[0] for crime in CRIME_TYPES],
            weights=[weight for _, weight in CRIME_TYPES]
        )[0]
        
        # Select a random location
        lat, lng, area = random.choice(LOCATIONS)
        
        # Add some randomness to the coordinates
        lat += random.uniform(-0.01, 0.01)
        lng += random.uniform(-0.01, 0.01)
        
        # Create the crime document
        crime_data = {
            'type': crime_type,
            'location': firestore.GeoPoint(lat, lng),
            'area': area,
            'description': f"{crime_type.capitalize()} reported in {area}",
            'severity': random.randint(1, 5),  # 1-5 severity level
            'timestamp': get_random_date(30),  # Within last 30 days
            'status': random.choice(['reported', 'under_investigation', 'resolved']),
            'reported_by': f"user{random.randint(1, 1000)}",
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        # Add to Firestore
        crimes_ref.add(crime_data)
        print(f"Added crime in {area}: {crime_type}")

if __name__ == '__main__':
    print("Adding sample crime data...")
    try:
        add_sample_data(50)  # Add 50 sample crimes
        print("Successfully added sample crime data!")
    except Exception as e:
        print(f"Error adding sample data: {e}")
