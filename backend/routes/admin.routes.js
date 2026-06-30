const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { firestore } = require('../config/firebase');
const { COLLECTIONS, ROLES, ISSUE_STATUS, DEPARTMENTS } = require('../config/constants');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize(ROLES.ADMIN));

/**
 * GET /api/admin/stats
 * Aggregate dashboard numbers. Built from lightweight queries rather than
 * scanning full documents (count() aggregation queries avoid reading image
 * payloads), keeping this cheap even as the issues collection grows.
 */
router.get('/stats', async (req, res) => {
  try {
    const issuesCol = firestore.collection(COLLECTIONS.ISSUES);

    const [totalSnap, assignedSnap, inProgressSnap, resolvedSnap, rejectedSnap, unverifiedSnap, usersSnap] =
      await Promise.all([
        issuesCol.count().get(),
        issuesCol.where('status', '==', ISSUE_STATUS.ASSIGNED).count().get(),
        issuesCol.where('status', '==', ISSUE_STATUS.IN_PROGRESS).count().get(),
        issuesCol.where('status', '==', ISSUE_STATUS.RESOLVED).count().get(),
        issuesCol.where('status', '==', ISSUE_STATUS.REJECTED).count().get(),
        issuesCol.where('locationVerification', '==', 'unverified').count().get(),
        firestore.collection(COLLECTIONS.USERS).count().get(),
      ]);

    // Per-department breakdown (small fixed list, cheap to loop)
    const byDepartment = {};
    for (const dept of DEPARTMENTS) {
      const snap = await issuesCol.where('departmentId', '==', dept.id).count().get();
      byDepartment[dept.id] = { name: dept.name, count: snap.data().count };
    }

    res.json({
      total: totalSnap.data().count,
      assigned: assignedSnap.data().count,
      inProgress: inProgressSnap.data().count,
      resolved: resolvedSnap.data().count,
      rejected: rejectedSnap.data().count,
      unverifiedLocation: unverifiedSnap.data().count,
      totalUsers: usersSnap.data().count,
      byDepartment,
    });
  } catch (err) {
    console.error('admin stats error', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// GET /api/admin/users - list all users (citizens, authorities, admins)
router.get('/users', async (req, res) => {
  const snap = await firestore.collection(COLLECTIONS.USERS).orderBy('createdAt', 'desc').limit(500).get();
  const users = snap.docs.map((d) => {
    const u = d.data();
    delete u.passwordHash;
    return u;
  });
  res.json({ users });
});

// POST /api/admin/users - admin provisions an authority (or another admin) account
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    if (![ROLES.AUTHORITY, ROLES.ADMIN, ROLES.CITIZEN].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (role === ROLES.AUTHORITY && !department) {
      return res.status(400).json({ error: 'department is required for authority accounts' });
    }

    const usersRef = firestore.collection(COLLECTIONS.USERS);
    const existing = await usersRef.where('email', '==', email.toLowerCase()).limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: 'Email already in use' });

    const uid = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const userDoc = {
      uid,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      department: role === ROLES.AUTHORITY ? department : null,
      points: 0,
      reportCount: 0,
      badges: [],
      createdAt: new Date().toISOString(),
    };
    await usersRef.doc(uid).set(userDoc);
    delete userDoc.passwordHash;
    res.status(201).json({ user: userDoc });
  } catch (err) {
    console.error('admin create user error', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// DELETE /api/admin/users/:uid
router.delete('/users/:uid', async (req, res) => {
  await firestore.collection(COLLECTIONS.USERS).doc(req.params.uid).delete();
  res.json({ message: 'User deleted' });
});

// GET /api/admin/departments - list department definitions
router.get('/departments', (req, res) => {
  res.json({ departments: DEPARTMENTS });
});

module.exports = router;
