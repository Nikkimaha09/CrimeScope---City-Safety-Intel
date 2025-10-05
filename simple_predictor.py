import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from statsmodels.tsa.arima.model import ARIMA
import os

class SimpleCrimePredictor:
    def __init__(self):
        self.model = None
        
    def prepare_data(self, crimes):
        """Convert crime data into time series format"""
        df = pd.DataFrame(crimes)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['date'] = df['timestamp'].dt.date
        return df
        
    def predict(self, crimes, days=7):
        """Simple prediction using ARIMA"""
        try:
            if not crimes:
                return self._empty_predictions(days)
                
            df = self.prepare_data(crimes)
            ts_data = df.groupby('date').size()
            
            if len(ts_data) < 2:
                return self._empty_predictions(days)
                
            # Fit ARIMA model
            self.model = ARIMA(ts_data, order=(1,1,1)).fit()
            forecast = self.model.forecast(steps=days)
            
            # Format predictions
            predictions = []
            for i, value in enumerate(forecast):
                predictions.append({
                    'date': (datetime.now() + timedelta(days=i+1)).strftime('%Y-%m-%d'),
                    'predicted_crimes': max(0, round(value, 2)),
                    'is_high_risk': False  # Will be updated later
                })
                
            # Add risk assessment
            return self._assess_risk(predictions)
            
        except Exception as e:
            print(f"Prediction error: {str(e)}")
            return self._empty_predictions(days)
    
    def _assess_risk(self, predictions):
        """Add risk assessment to predictions"""
        if not predictions:
            return predictions
            
        crimes = [p['predicted_crimes'] for p in predictions]
        threshold = np.percentile(crimes, 75) if crimes else 0
        
        for p in predictions:
            p['is_high_risk'] = p['predicted_crimes'] > threshold
            
        return predictions
        
    def _empty_predictions(self, days):
        """Return empty predictions"""
        return [{
            'date': (datetime.now() + timedelta(days=i+1)).strftime('%Y-%m-%d'),
            'predicted_crimes': 0,
            'is_high_risk': False
        } for i in range(days)]
