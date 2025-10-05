import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from datetime import datetime
import pytz

class HotZonePredictor:
    def __init__(self):
        self.model = self._build_model()
        self.scaler = StandardScaler()
        
    def _build_model(self):
        """Build LSTM model for crime prediction"""
        model = Sequential([
            LSTM(50, return_sequences=True, input_shape=(10, 1)),
            Dropout(0.2),
            LSTM(50, return_sequences=False),
            Dropout(0.2),
            Dense(1)
        ])
        model.compile(optimizer='adam', loss='mse')
        return model
        
    def prepare_data(self, crime_data):
        """Prepare data for prediction"""
        # Convert timestamps to features
        timestamps = pd.to_datetime([d['timestamp'] for d in crime_data])
        
        # Extract features
        features = []
        for ts in timestamps:
            features.append([
                ts.hour / 24,  # Normalize hour
                ts.weekday() / 7,  # Normalize weekday
                ts.month / 12  # Normalize month
            ])
            
        return np.array(features)
        
    def get_predictions(self):
        """Get crime hotspot predictions"""
        # This would typically get real data from the database
        # For now, returning mock predictions
        return {
            'hotspots': [
                {'location': 'Downtown', 'probability': 0.85},
                {'location': 'Eastside', 'probability': 0.75},
                {'location': 'Westside', 'probability': 0.65}
            ],
            'timestamp': datetime.now(pytz.timezone('Asia/Kolkata')).isoformat()
        }
        
    def train(self, crime_data):
        """Train the prediction model"""
        X = self.prepare_data(crime_data)
        y = np.array([d['severity'] for d in crime_data])
        
        X_scaled = self.scaler.fit_transform(X)
        
        # Reshape for LSTM input
        X_scaled = X_scaled.reshape((X_scaled.shape[0], 1, X_scaled.shape[1]))
        
        self.model.fit(X_scaled, y, epochs=50, batch_size=32, verbose=0)
