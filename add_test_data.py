import requests
import json

def add_test_data():
    base_url = 'http://127.0.0.1:5002/api'
    crimes = [
        {'type': 'theft', 'latitude': 28.6139, 'longitude': 77.2090, 'location': '28.6139, 77.2090', 'severity': 3, 'description': 'Test theft 1'},
        {'type': 'assault', 'latitude': 28.6150, 'longitude': 77.2100, 'location': '28.6150, 77.2100', 'severity': 5, 'description': 'Test assault 1'},
        {'type': 'burglary', 'latitude': 28.6140, 'longitude': 77.2080, 'location': '28.6140, 77.2080', 'severity': 4, 'description': 'Test burglary 1'},
        {'type': 'theft', 'latitude': 28.6145, 'longitude': 77.2095, 'location': '28.6145, 77.2095', 'severity': 2, 'description': 'Test theft 2'},
        {'type': 'fraud', 'latitude': 28.6135, 'longitude': 77.2095, 'location': '28.6135, 77.2095', 'severity': 1, 'description': 'Test fraud 1'}
    ]
    
    for crime in crimes:
        try:
            response = requests.post(f'{base_url}/report', json=crime)
            print(f'Reported {crime["type"]} (Severity: {crime["severity"]}): {response.status_code} {response.text}')
        except Exception as e:
            print(f'Error reporting {crime["type"]}: {str(e)}')

if __name__ == '__main__':
    add_test_data()
