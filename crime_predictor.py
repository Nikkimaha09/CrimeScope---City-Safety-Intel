import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from statsmodels.tsa.arima.model import ARIMA
from sklearn.preprocessing import MinMaxScaler
import joblib
import os

class CrimePredictor:
    def __init__(self):
        self.scaler = MinMaxScaler()
        self.model_dir = 'models'
        os.makedirs(self.model_dir, exist_ok=True)
        self.arima_model = None
        self.sequence_length = 7  # Number of days to look back for predictions

    def prepare_time_series_data(self, crimes):
        """Convert crime data into time series format"""
        # Convert to DataFrame
        df = pd.DataFrame(crimes)
        
        # Ensure timestamp is datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['date'] = df['timestamp'].dt.date
        
        # Group by date and count crimes
        daily_crimes = df.groupby('date').size().reset_index(name='count')
        daily_crimes.set_index('date', inplace=True)
        
        # Fill missing dates with 0
        idx = pd.date_range(daily_crimes.index.min(), daily_crimes.index.max())
        daily_crimes = daily_crimes.reindex(idx, fill_value=0)
        
        return daily_crimes

    def train_arima(self, data, order=(5,1,0)):
        """Train ARIMA model"""
        try:
            self.arima_model = ARIMA(data, order=order)
            self.arima_model = self.arima_model.fit()
            # Save the model
            joblib.dump(self.arima_model, f'{self.model_dir}/arima_model.joblib')
            return True
        except Exception as e:
            print(f"Error training ARIMA model: {e}")
            return False

    def predict_arima(self, steps=7):
        """Make predictions using ARIMA"""
        if not self.arima_model:
            raise Exception("ARIMA model not trained")
        
        forecast = self.arima_model.forecast(steps=steps)
        return forecast

    def prepare_lstm_data(self, data, sequence_length=7):
        """Prepare data for LSTM"""
        scaled_data = self.scaler.fit_transform(data.values.reshape(-1, 1))
        
        X, y = [], []
        for i in range(len(scaled_data) - sequence_length):
            X.append(scaled_data[i:(i + sequence_length), 0])
            y.append(scaled_data[i + sequence_length, 0])
        
        return np.array(X), np.array(y)

    def build_lstm_model(self, input_shape):
        """Build LSTM model"""
        model = Sequential([
            LSTM(50, return_sequences=True, input_shape=input_shape),
            Dropout(0.2),
            LSTM(50, return_sequences=False),
            Dropout(0.2),
            Dense(25),
            Dense(1)
        ])
        
        model.compile(optimizer='adam', loss='mean_squared_error')
        return model

    def train_lstm(self, X_train, y_train, epochs=20, batch_size=32):
        """Train LSTM model"""
        try:
            self.lstm_model = self.build_lstm_model((X_train.shape[1], 1))
            self.lstm_model.fit(
                X_train, y_train,
                epochs=epochs,
                batch_size=batch_size,
                verbose=1
            )
            # Save the model and scaler
            self.lstm_model.save(f'{self.model_dir}/lstm_model.keras')
            joblib.dump(self.scaler, f'{self.model_dir}/lstm_scaler.joblib')
            return True
        except Exception as e:
            print(f"Error training LSTM model: {e}")
            return False

    def predict_lstm(self, last_sequence, steps=7):
        """Make predictions using LSTM"""
        if not self.lstm_model:
            raise Exception("LSTM model not trained")
        
        predictions = []
        current_sequence = last_sequence.copy()
        
        for _ in range(steps):
            # Reshape input for prediction
            x_input = current_sequence.reshape((1, self.sequence_length, 1))
            # Predict next value
            prediction = self.lstm_model.predict(x_input)
            predictions.append(prediction[0][0])
            # Update current sequence
            current_sequence = np.roll(current_sequence, -1)
            current_sequence[-1] = prediction[0][0]
        
        return predictions

    def predict_with_arima(self, df, steps=7):
        """Make predictions using ARIMA model"""
        # Aggregate data by date
        ts_data = df.groupby('date').size()
        
        # If no data, return empty predictions
        if len(ts_data) < 2:
            return [{'date': (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d'), 
                    'predicted_crimes': 0} for i in range(1, steps+1)]
        
        # Fit ARIMA model
        try:
            self.arima_model = ARIMA(ts_data, order=(1,1,1))
            self.arima_model = self.arima_model.fit()
            
            # Make predictions
            forecast = self.arima_model.forecast(steps=steps)
            
            # Create predictions list
            predictions = []
            for i, value in enumerate(forecast):
                predictions.append({
                    'date': (datetime.now() + timedelta(days=i+1)).strftime('%Y-%m-%d'),
                    'predicted_crimes': max(0, round(value, 2))
                })
                
            return predictions
            
        except Exception as e:
            print(f"ARIMA prediction error: {str(e)}")
            # Fallback: return average of last 7 days
            avg = ts_data.tail(7).mean() if not ts_data.empty else 0
            return [{'date': (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d'), 
                    'predicted_crimes': round(avg, 2)} for i in range(1, steps+1)]

    def assess_risk(self, predictions):
        """Add risk assessment to predictions"""
        if not predictions:
            return predictions
            
        # Calculate 75th percentile of predicted crimes
        crimes = [p['predicted_crimes'] for p in predictions]
        threshold = np.percentile(crimes, 75) if crimes else 0
        
        # Add risk flag
        for p in predictions:
            p['is_high_risk'] = p['predicted_crimes'] > threshold
            
        return predictions

    def predict_hot_zones(self, crimes, days=7):
        """
        Predict hot zones for the next 'days' days using ARIMA model.
        Returns a list of predictions with date, predicted_crimes, and is_high_risk flag.
        """
        try:
            if not crimes:
                raise ValueError("No crime data provided")
                
            # Prepare time series data
            df = self.prepare_time_series_data(crimes)
            
            # Make predictions using ARIMA
            predictions = self.predict_with_arima(df, days)
                
            # Add risk assessment
            predictions = self.assess_risk(predictions)
            
            return {
                'status': 'success',
                'data': predictions
            }
                        self.train_lstm(X, y)
                
                # Get last sequence for prediction
                last_sequence = scaled_data[-self.sequence:].flatten()
                predictions = self.predict_lstm(last_sequence, steps=days_ahead)
                
                # Create date range for predictions
                last_date = ts_data.index[-1]
                date_range = [last_date + timedelta(days=i+1) for i in range(days_ahead)]
                
                return pd.Series(predictions, index=date_range)
            
            else:
                raise ValueError("Invalid method. Choose 'arima' or 'lstm'.")
                
        except Exception as e:
            print(f"Error in predict_hot_zones: {e}")
            return None
