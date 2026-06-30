const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { firestore } = require('../config/firebase');
const { COLLECTIONS, ROLES } = require('../config/constants');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      uid: user.uid,
      role: user.role,
      name: user.name,
      department: user.department || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Public self-registration - citizens only. Authority + admin accounts are
// provisioned by an existing admin via /api/admin/users.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    const usersRef = firestore.collection(COLLECTIONS.USERS);
    const existing = await usersRef.where('email', '==', email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const uid = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const userDoc = {
      uid,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: ROLES.CITIZEN,
      points: 0,
      reportCount: 0,
      badges: [],
      createdAt: new Date().toISOString(),
    };

    await usersRef.doc(uid).set(userDoc);

    const token = signToken(userDoc);
    delete userDoc.passwordHash;
    res.status(201).json({ token, user: userDoc });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const usersRef = firestore.collection(COLLECTIONS.USERS);
    const snap = await usersRef.where('email', '==', email.toLowerCase()).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: 'Invalid credentials' });

    const userDoc = snap.docs[0].data();
    const match = await bcrypt.compare(password, userDoc.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(userDoc);
    delete userDoc.passwordHash;
    res.json({ token, user: userDoc });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  const snap = await firestore.collection(COLLECTIONS.USERS).doc(req.user.uid).get();
  if (!snap.exists) return res.status(404).json({ error: 'User not found' });
  const userDoc = snap.data();
  delete userDoc.passwordHash;
  res.json({ user: userDoc });
});

module.exports = router;
