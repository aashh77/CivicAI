const express = require('express');
const { firestore } = require('../config/firebase');
const { COLLECTIONS, ROLES, ISSUE_STATUS } = require('../config/constants');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize(ROLES.AUTHORITY));

// GET /api/authority/summary - quick counts for this authority's own department
router.get('/summary', async (req, res) => {
  try {
    const issuesCol = firestore.collection(COLLECTIONS.ISSUES).where('departmentId', '==', req.user.department);

    const [assignedSnap, inProgressSnap, resolvedSnap] = await Promise.all([
      issuesCol.where('status', '==', ISSUE_STATUS.ASSIGNED).count().get(),
      issuesCol.where('status', '==', ISSUE_STATUS.IN_PROGRESS).count().get(),
      issuesCol.where('status', '==', ISSUE_STATUS.RESOLVED).count().get(),
    ]);

    res.json({
      department: req.user.department,
      assigned: assignedSnap.data().count,
      inProgress: inProgressSnap.data().count,
      resolved: resolvedSnap.data().count,
    });
  } catch (err) {
    console.error('authority summary error', err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

module.exports = router;
