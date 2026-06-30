const express = require('express');
const { firestore } = require('../config/firebase');
const { COLLECTIONS, ROLES } = require('../config/constants');
const { authenticate, authorize } = require('../middleware/auth');
const { getLeaderboard } = require('../services/gamification.service');

const router = express.Router();

// GET /api/user/leaderboard - public-ish, but require login to view (citizen portal feature)
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(20);
    res.json({ leaderboard });
  } catch (err) {
    console.error('leaderboard error', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /api/user/profile - own points, badges, report count
router.get('/profile', authenticate, authorize(ROLES.CITIZEN), async (req, res) => {
  const snap = await firestore.collection(COLLECTIONS.USERS).doc(req.user.uid).get();
  if (!snap.exists) return res.status(404).json({ error: 'User not found' });
  const user = snap.data();
  delete user.passwordHash;
  res.json({ user });
});

module.exports = router;
