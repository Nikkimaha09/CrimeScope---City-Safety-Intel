import pandas as pd
import numpy as np
from datetime import datetime
import re

class CrimeAnalyzer:
    def __init__(self):
        self.crime_types = {
            'theft': ['theft', 'robbery', 'stolen'],
            'assault': ['assault', 'attack', 'violence'],
            'burglary': ['burglary', 'break-in'],
            'fraud': ['fraud', 'scam', 'cheat']
        }
        
    def validate_report(self, report):
        """Validate a crime report based on required fields and content"""
        required_fields = ['location', 'description', 'timestamp', 'severity']
        
        if not all(field in report for field in required_fields):
            return False
            
        # Check if description contains valid crime keywords
        description = report['description'].lower()
        valid = False
        for crime_type, keywords in self.crime_types.items():
            if any(keyword in description for keyword in keywords):
                valid = True
                break
                
        return valid
        
    def get_trends(self):
        """Analyze crime trends over time"""
        # This would typically get data from the database
        # For now, returning mock data
        return {
            'weekly_trends': {
                'theft': [10, 12, 8, 15, 11, 9, 13],
                'assault': [5, 6, 4, 7, 5, 3, 6],
                'burglary': [3, 2, 4, 3, 2, 3, 4]
            },
            'hotspots': [
                {'location': 'Downtown', 'count': 25},
                {'location': 'Eastside', 'count': 18},
                {'location': 'Westside', 'count': 12}
            ]
        }
        
    def calculate_severity_score(self, report):
        """Calculate severity score based on multiple factors"""
        base_score = report['severity']
        time_bonus = self._get_time_bonus(report['timestamp'])
        location_bonus = self._get_location_bonus(report['location'])
        
        return base_score + time_bonus + location_bonus
        
    def _get_time_bonus(self, timestamp):
        # Higher score during peak hours
        hour = datetime.fromisoformat(timestamp).hour
        if 6 <= hour <= 9 or 16 <= hour <= 20:
            return 2
        return 1
        
    def _get_location_bonus(self, location):
        # Higher score in known high-crime areas
        if location in ['Downtown', 'Eastside']:
            return 2
        return 1
