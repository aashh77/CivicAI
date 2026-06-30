/**
 * Centralized Google Cloud client initialization.
 * Both Firestore and Cloud Vision authenticate using the same
 * service account key referenced by GOOGLE_APPLICATION_CREDENTIALS.
 */
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const vision = require('@google-cloud/vision');

const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(__dirname, '..', process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : undefined;

const firestore = new Firestore({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename,
  databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
});

const visionClient = new vision.ImageAnnotatorClient({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename,
});

module.exports = { firestore, visionClient };
