import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def setup_firebase():
    try:
        # Initialize Firebase
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": os.getenv('FIREBASE_PROJECT_ID'),
            "private_key_id": os.getenv('FIREBASE_PRIVATE_KEY_ID'),
            "private_key": os.getenv('FIREBASE_PRIVATE_KEY'),
            "client_email": os.getenv('FIREBASE_CLIENT_EMAIL'),
            "client_id": os.getenv('FIREBASE_CLIENT_ID'),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.getenv('FIREBASE_CLIENT_X509_CERT_URL')
        })
        
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        # Create test documents in collections
        # Crimes collection
        crimes_ref = db.collection('crimes')
        test_crime = {
            'type': 'Theft',
            'severity': 'Medium',
            'location': {
                'lat': 12.9716,
                'lng': 77.5946
            },
            'timestamp': firestore.SERVER_TIMESTAMP,
            'status': 'Reported'
        }
        crimes_ref.add(test_crime)
        
        # Predictions collection
        predictions_ref = db.collection('predictions')
        test_prediction = {
            'area': 'Central Bangalore',
            'predicted_crime_type': 'Theft',
            'probability': 0.85,
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        predictions_ref.add(test_prediction)
        
        # Users collection
        users_ref = db.collection('users')
        test_user = {
            'email': 'test@example.com',
            'phone': '+911234567890',
            'last_login': firestore.SERVER_TIMESTAMP,
            'notifications_enabled': True
        }
        users_ref.add(test_user)
        
        print("\nFirebase setup completed successfully!")
        print("Test documents created in collections:")
        print("- crimes")
        print("- predictions")
        print("- users")
        
    except Exception as e:
        print(f"Error setting up Firebase: {str(e)}")
        return
    
    print("\nFirebase setup completed successfully!")
    print("You can now run the main application.")

if __name__ == '__main__':
    print("Starting Firebase setup...")
    setup_firebase()
