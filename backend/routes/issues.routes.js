const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { firestore } = require('../config/firebase');
const { FieldValue } = require('@google-cloud/firestore');
const {
  COLLECTIONS,
  SUBCOLLECTIONS,
  ROLES,
  ISSUE_STATUS,
  LOCATION_VERIFICATION,
  POINTS,
} = require('../config/constants');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { analyzeImage } = require('../services/vision.service');
const { categorizeIssue } = require('../services/categorization.service');
const { predictResolutionTime } = require('../services/prediction.service'); // Added resolution prediction engine tool
const { extractGpsFromImage } = require('../utils/exif');
const { geocodeAddress, reverseGeocode, distanceKm } = require('../services/geocode.service');
const { compressImageToBase64 } = require('../utils/imageProcess');
const { awardPoints } = require('../services/gamification.service');

const router = express.Router();
const GEO_TOLERANCE_KM = parseFloat(process.env.GEO_VERIFICATION_TOLERANCE_KM || '0.6');

/**
 * POST /api/issues
 * Citizen reports a new issue. Runs the full AI pipeline synchronously:
 *  1. AI verification of image against user-provided title/description & extracts priority status
 *  2. Content validation & Early rejection filters (Spam / Moderation)
 *  3. Contextual categorization -> department routing
 *  4. Resolution timeframe prediction calculated dynamically against live backlog volumes
 *  5. EXIF GPS extraction from the image
 *  6. Cross-check EXIF GPS vs. user-provided address (geocoded) -> verification tag
 *  7. Compress + store image as base64 inside the Firestore issue document
 *  8. Award reporting points (gamification)
 */
router.post('/', authenticate, authorize(ROLES.CITIZEN), upload.single('image'), async (req, res) => {
  try {
    const { title, description, addressText } = req.body;

    // Strict Backend Requirement Check
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Validation failed: Title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Validation failed: Description is required.' });
    }
    if (!addressText || !addressText.trim()) {
      return res.status(400).json({ message: 'Validation failed: Address text is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Validation failed: Image file is required.' });
    }

    // --- Step 1: Vision analysis & Content Verification ---
    const visionResult = await analyzeImage(req.file.buffer, title, description);

    // Immediate safety guard - reject explicit, abusive, or violent images
    if (visionResult.requiresModeration) {
      return res.status(422).json({ 
        error: 'Image failed content safety check and was not accepted.',
        reason: visionResult.reason 
      });
    }

    // Secondary early guard - stop stock photos, screenshots, memes, and unrelated clutter
    if (visionResult.isSpamOrUnrelated) {
      return res.status(422).json({ 
        error: 'Submission rejected. Uploaded image is unrelated to public civic issue reports.',
        reason: visionResult.reason 
      });
    }

    // --- Step 2: Categorization + department routing ---
    const categorization = await categorizeIssue(title, description, visionResult.reason);

    // --- Step 3: Resolution Window Time Frame Prediction Agent ---
    // Calculates turnaround window using target department open tickets and target criticality rating
    const predictedTime = await predictResolutionTime(
      categorization?.departmentId || 'public_works', 
      visionResult.criticality || 'medium'
    );

    let hoursToAdd = 24; // Default safety fallback: 24 hours
    
    if (predictedTime && typeof predictedTime === 'string') {
      // Extract any numbers out of strings like "2-4 Hours" or "1-2 Days"
      const numbers = predictedTime.match(/\d+/g);
      
      if (predictedTime.toLowerCase().includes('hour')) {
        // Take the maximum number from the range (e.g., "2-4" -> 4)
        hoursToAdd = numbers ? Math.max(...numbers.map(Number)) : 4; 
      } else if (predictedTime.toLowerCase().includes('day')) {
        // Convert days directly to hours (e.g., "1-2" -> 2 days -> 48 hours)
        hoursToAdd = numbers ? Math.max(...numbers.map(Number)) * 24 : 48;
      }
    }

    const nowObj = new Date();
    const slaDeadlineObj = new Date(nowObj.getTime() + (hoursToAdd * 60 * 60 * 1000));
    const slaDeadlineIso = slaDeadlineObj.toISOString();

    // --- Step 4: EXIF GPS extraction ---
    const exifGps = await extractGpsFromImage(req.file.buffer);

    // --- Step 5: Location verification & Iterative Fallback Engine ---
    let location = { lat: null, lng: null, addressText, resolvedAddress: null };
    let verification = LOCATION_VERIFICATION.NO_METADATA;
    let verificationDetail = 'No GPS metadata found in the uploaded image; trusting the address you provided.';

    // 1. Core Forward Geocoding Pass
    let geocodedUserAddress = await geocodeAddress(addressText).catch(() => null);
    let fallbackUsed = false;

    // 2. Iterative Address Fallback: Trim by commas if precise address text fails
    if (!geocodedUserAddress && addressText.includes(',')) {
      const addressParts = addressText.split(',');
      // Iteratively remove the most granular parts (left-most tokens) to find a rough area
      for (let i = 1; i < addressParts.length; i++) {
        const broadQuery = addressParts.slice(i).join(',').trim();
        if (broadQuery.length > 4) { // Ignore trivially short remnants
          geocodedUserAddress = await geocodeAddress(broadQuery).catch(() => null);
          if (geocodedUserAddress) {
            fallbackUsed = true;
            break;
          }
        }
      }
    }

    // 3. Evaluation Triage Matrix
    if (exifGps) {
      // Photo has embedded data: Reverse geocode to find its structural real-world address
      const resolvedAddress = await reverseGeocode(exifGps.lat, exifGps.lng).catch(() => null);
      location = {
        lat: exifGps.lat,
        lng: exifGps.lng,
        addressText,
        resolvedAddress,
      };

      if (geocodedUserAddress) {
        const dist = distanceKm(exifGps, geocodedUserAddress);
        if (dist <= GEO_TOLERANCE_KM) {
          verification = LOCATION_VERIFICATION.VERIFIED;
          verificationDetail = `Photo GPS location matches the provided address (within ${dist.toFixed(2)} km).`;
        } else {
          verification = LOCATION_VERIFICATION.UNVERIFIED;
          verificationDetail = `Photo GPS location is ${dist.toFixed(2)} km away from the reported address (${dist.toFixed(1)} km delta) - flagged for review.`;
        }
      } else {
        // Photo GPS is valid, but the user typed complete gibberish
        verification = LOCATION_VERIFICATION.UNVERIFIED;
        verificationDetail = 'Image contains coordinates, but user address text could not be geocoded or resolved.';
      }
    } else {
      // No Photo GPS Metadata available: Rely completely on forward geocoding results
      if (geocodedUserAddress) {
        location = {
          lat: geocodedUserAddress.lat,
          lng: geocodedUserAddress.lng,
          addressText,
          resolvedAddress: geocodedUserAddress.displayName,
        };
        verification = fallbackUsed ? LOCATION_VERIFICATION.UNVERIFIED : LOCATION_VERIFICATION.NO_METADATA;
        verificationDetail = fallbackUsed
          ? 'Precise text address failed. Pin dropped on broader matching district or city area.'
          : 'Address resolved successfully. (Photo did not contain embedded coordinate metadata)';
      } else {
        // Absolute failure: Neither photo data nor address lines returned any geographical location
        return res.status(422).json({
          message: 'Location mapping failed. The address provided could not be resolved to a known coordinates vector. Please specify a clearer street name, city, zip code, or distinct landmark.'
        });
      }
    }

    // --- Step 6: Compress + store image ---
    const compressed = await compressImageToBase64(req.file.buffer);

    if (compressed.sizeKB > 800) {
      return res.status(422).json({ error: 'Image file size is too large for database storage. Please upload a smaller image.' });
    }

    const issueId = uuidv4();
    const now = new Date().toISOString();

    const issueDoc = {
      id: issueId,
      title: title || categorization?.categoryLabel || 'Unnamed Issue',
      description: description || '',
      category: categorization?.category || 'uncategorized',
      categoryLabel: categorization?.categoryLabel || 'Uncategorized',
      aiConfidence: categorization?.confidence || (visionResult.isVerified ? 1.0 : 0.5),
      
      // Store AI verification outputs contextually inside the record schema
      isAiVerified: visionResult.isVerified,
      aiVerificationReason: visionResult.reason,
      aiLabels: visionResult.reason ? [visionResult.reason] : [],
      
      // Commit the target priority level status and calculated timeframe tags down to the document object record
      criticality: visionResult.criticality || 'medium',
      predictedTime: predictedTime,

      slaDeadline: slaDeadlineIso,     // Hard deadline anchor point (e.g. "2026-07-01T12:00:00.000Z")
      escalationLevel: 0,              // 0 = Normal tracking state. Background process handles incrementation

      departmentId: categorization?.departmentId || null,
      departmentName: categorization?.departmentName || 'General',
      status: ISSUE_STATUS.ASSIGNED,
      location,
      locationVerification: verification,
      locationVerificationDetail: verificationDetail,
      reporterUid: req.user?.uid || 'anonymous',
      reporterName: req.user?.name || 'Anonymous User',
      image: compressed.base64,
      imageSizeKB: compressed.sizeKB,
      resolvedImage: null,
      verificationCount: 0,
      pointsAwarded: POINTS.REPORT_ISSUE,
      createdAt: now,
      updatedAt: now,
      assignedAt: now,
      resolvedAt: null,
    };

    await firestore.collection(COLLECTIONS.ISSUES).doc(issueId).set(issueDoc);

    const gamification = await awardPoints(req.user.uid, POINTS.REPORT_ISSUE, { incrementReportCount: true });

    res.status(201).json({ issue: issueDoc, gamification });
  } catch (err) {
    console.error('create issue error', err);
    res.status(500).json({ error: 'Failed to process and create issue' });
  }
});

/**
 * GET /api/issues
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { department, status, reporterUid, category, limit } = req.query;
    let q = firestore.collection(COLLECTIONS.ISSUES);

    if (req.user.role === ROLES.AUTHORITY) {
      q = q.where('departmentId', '==', req.user.department);
    } else if (department) {
      q = q.where('departmentId', '==', department);
    }

    if (status) q = q.where('status', '==', status);
    if (category) q = q.where('category', '==', category);

    if (req.user.role === ROLES.CITIZEN) {
      q = q.where('reporterUid', '==', req.user.uid);
    } else if (reporterUid) {
      q = q.where('reporterUid', '==', reporterUid);
    }

    const snap = await q.limit(Math.min(parseInt(limit || '100', 10), 200)).get();
    const issues = snap.docs.map((d) => d.data()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json({ issues });
  } catch (err) {
    console.error('list issues error', err);
    res.status(500).json({ error: 'Failed to list issues' });
  }
});

// Public read-only community feed (no auth) - used for the "nearby issues" map view.
router.get('/public/feed', async (req, res) => {
  try {
    const snap = await firestore
      .collection(COLLECTIONS.ISSUES)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const issues = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        title: data.title,
        category: data.categoryLabel,
        status: data.status,
        location: data.location,
        locationVerification: data.locationVerification,
        createdAt: data.createdAt,
      };
    });
    res.json({ issues });
  } catch (err) {
    console.error('public feed error', err);
    res.status(500).json({ error: 'Failed to load feed' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  const snap = await firestore.collection(COLLECTIONS.ISSUES).doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Issue not found' });
  res.json({ issue: snap.data() });
});

/**
 * POST /api/issues/:id/verify
 */
router.post('/:id/verify', authenticate, authorize(ROLES.CITIZEN), async (req, res) => {
  try {
    const issueRef = firestore.collection(COLLECTIONS.ISSUES).doc(req.params.id);
    const issueSnap = await issueRef.get();
    if (!issueSnap.exists) return res.status(404).json({ error: 'Issue not found' });
    const issue = issueSnap.data();

    if (issue.reporterUid === req.user.uid) {
      return res.status(400).json({ error: 'You cannot verify your own report' });
    }

    const voteRef = issueRef.collection(SUBCOLLECTIONS.VERIFICATIONS).doc(req.user.uid);
    const voteSnap = await voteRef.get();
    if (voteSnap.exists) {
      return res.status(409).json({ error: 'You already verified this issue' });
    }

    await voteRef.set({ uid: req.user.uid, votedAt: new Date().toISOString() });
    await issueRef.update({ verificationCount: FieldValue.increment(1), updatedAt: new Date().toISOString() });

    await awardPoints(issue.reporterUid, POINTS.COMMUNITY_VERIFICATION_RECEIVED);
    const verifierGamification = await awardPoints(req.user.uid, POINTS.COMMUNITY_VERIFICATION_GIVEN);

    res.json({ message: 'Issue verified', gamification: verifierGamification });
  } catch (err) {
    console.error('verify issue error', err);
    res.status(500).json({ error: 'Failed to verify issue' });
  }
});

/**
 * PATCH /api/issues/:id/status
 */
router.patch('/:id/status', authenticate, authorize(ROLES.AUTHORITY, ROLES.ADMIN), async (req, res) => {
  try {
    const { status } = req.body;
    if (![ISSUE_STATUS.IN_PROGRESS, ISSUE_STATUS.REJECTED].includes(status)) {
      return res.status(400).json({ error: 'Invalid status transition for this endpoint' });
    }

    const issueRef = firestore.collection(COLLECTIONS.ISSUES).doc(req.params.id);
    const issueSnap = await issueRef.get();
    if (!issueSnap.exists) return res.status(404).json({ error: 'Issue not found' });
    const issue = issueSnap.data();

    if (req.user.role === ROLES.AUTHORITY && issue.departmentId !== req.user.department) {
      return res.status(403).json({ error: 'This issue does not belong to your department' });
    }

    await issueRef.update({ status, updatedAt: new Date().toISOString() });
    res.json({ message: 'Status updated' });
  } catch (err) {
    console.error('update status error', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * POST /api/issues/:id/resolve
 */
router.post(
  '/:id/resolve',
  authenticate,
  authorize(ROLES.AUTHORITY),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'A resolution image is required' });

      const issueRef = firestore.collection(COLLECTIONS.ISSUES).doc(req.params.id);
      const issueSnap = await issueRef.get();
      if (!issueSnap.exists) return res.status(404).json({ error: 'Issue not found' });
      const issue = issueSnap.data();

      if (issue.departmentId !== req.user.department) {
        return res.status(403).json({ error: 'This issue does not belong to your department' });
      }

      const compressed = await compressImageToBase64(req.file.buffer);
      const now = new Date().toISOString();

      await issueRef.update({
        status: ISSUE_STATUS.RESOLVED,
        resolvedImage: compressed.base64,
        resolvedBy: req.user.uid,
        resolvedByName: req.user.name,
        resolvedAt: now,
        updatedAt: now,
        resolutionNote: req.body.note || '',
      });

      const gamification = await awardPoints(issue.reporterUid, POINTS.ISSUE_RESOLVED_BONUS);

      res.json({ message: 'Issue marked resolved', gamification });
    } catch (err) {
      console.error('resolve issue error', err);
      res.status(500).json({ error: 'Failed to resolve issue' });
    }
  }
);

module.exports = router;