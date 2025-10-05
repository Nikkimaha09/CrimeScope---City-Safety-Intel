import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_firebase_connection():
    try:
        # Initialize Firebase
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": os.getenv('FIREBASE_PROJECT_ID'),
            "private_key": os.getenv('FIREBASE_PRIVATE_KEY'),
            "client_email": os.getenv('FIREBASE_CLIENT_EMAIL'),
            "private_key_id": os.getenv('FIREBASE_PRIVATE_KEY_ID'),
            "client_id": os.getenv('FIREBASE_CLIENT_ID'),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.getenv('FIREBASE_CLIENT_X509_CERT_URL')
        })
        
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        # Test writing to Firestore
        test_ref = db.collection('test').document('connection')
        test_ref.set({
            'status': 'connected',
            'timestamp': firestore.SERVER_TIMESTAMP
        })
        
        # Read back the document
        doc = test_ref.get()
        if doc.exists:
            print("\nFirebase connection successful!")
            print(f"Test document created at: {doc.to_dict()['timestamp']}")
            return True
        else:
            print("Failed to read test document")
            return False
    except Exception as e:
        print(f"Error testing Firebase connection: {str(e)}")
        return False

def main():
    print("Testing Firebase connection...")
    if test_firebase_connection():
        print("\nYou can now run the main application.")
    else:
        print("\nPlease check your Firebase configuration in .env file.")

if __name__ == '__main__':
    main()
