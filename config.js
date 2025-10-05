// Import Firebase using CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, onSnapshot, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-analytics.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDdJfYvIMe9eVi8dHS0JCGK07pN3J74Jog",
  authDomain: "crimescope-61702-f7129.firebaseapp.com",
  projectId: "crimescope-61702-f7129",
  storageBucket: "crimescope-61702-f7129.firebasestorage.app",
  messagingSenderId: "1025896397778",
  appId: "1:1025896397778:web:5699472f64abd390c5260b",
  measurementId: "G-KMQ75WN4DF"
};

// Initialize Firebase
let app, db, analytics;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  analytics = getAnalytics(app);
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
}

// Helper function to get crime type color
function getCrimeColor(crimeType) {
    const colors = {
        'theft': '#ef476f',
        'assault': '#ffd166',
        'burglary': '#06d6a0',
        'fraud': '#7209b7',
        'vandalism': '#f8961e',
        'default': '#4361ee'
    };
    return colors[crimeType] || colors['default'];
}

// Helper function to format dates
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Helper function to get severity text
function getSeverityText(severity) {
    const levels = {
        1: 'Low',
        2: 'Moderate',
        3: 'High',
        4: 'Very High',
        5: 'Critical'
    };
    return levels[severity] || 'Unknown';
}

// Export everything needed by other modules
export { 
    db, 
    getCrimeColor, 
    formatDate, 
    getSeverityText,
    // Firestore functions
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    onSnapshot, 
    addDoc, 
    Timestamp 
};