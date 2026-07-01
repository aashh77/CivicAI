/**
 * Centralized Google Cloud client initialization.
 * Both Firestore and Cloud Vision authenticate using the same
 * service account key. Handles local files and Vercel environment strings.
 */
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const vision = require('@google-cloud/vision');

let configOptions = {
  projectId: process.env.GCP_PROJECT_ID,
};

// Vercel / Production: Read credentials directly from the string variable
if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    configOptions.credentials = credentials;
  } catch (err) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string:", err);
  }
} else {
  // Local Development: Fall back to your file path
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(__dirname, '..', process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : undefined;
  
  if (keyFilename) {
    configOptions.keyFilename = keyFilename;
  }
}

// Initialize Firestore
const firestore = new Firestore({
  ...configOptions,
  databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
});

// Initialize Vision Client
const visionClient = new vision.ImageAnnotatorClient(configOptions);

module.exports = { firestore, visionClient };