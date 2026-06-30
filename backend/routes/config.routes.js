const express = require('express');
const { firestore } = require('../config/firebase');
const { COLLECTIONS, AVAILABLE_TABS, ROLES } = require('../config/constants');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const CONFIG_DOC_ID = 'tabConfig';

function defaultTabConfig() {
  const userTabs = {};
  const authorityTabs = {};
  AVAILABLE_TABS.forEach((tab) => {
    if (tab.portals.includes('user')) userTabs[tab.id] = true;
    if (tab.portals.includes('authority')) authorityTabs[tab.id] = true;
  });
  return { userTabs, authorityTabs };
}

async function getConfigDoc() {
  const ref = firestore.collection(COLLECTIONS.CONFIG).doc(CONFIG_DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    const initial = defaultTabConfig();
    await ref.set(initial);
    return initial;
  }
  return snap.data();
}

// Public (no-auth) read - the user/authority frontends load this on boot to
// know which tabs/nav items to render. Read-only and contains no sensitive data.
router.get('/tabs', async (req, res) => {
  try {
    const config = await getConfigDoc();
    res.json({ config, availableTabs: AVAILABLE_TABS });
  } catch (err) {
    console.error('get tab config error', err);
    res.status(500).json({ error: 'Failed to load tab configuration' });
  }
});

// Admin-only write - toggle tab visibility per portal
router.put('/tabs', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
  try {
    const { userTabs, authorityTabs } = req.body;
    const ref = firestore.collection(COLLECTIONS.CONFIG).doc(CONFIG_DOC_ID);
    const update = {};
    if (userTabs) update.userTabs = userTabs;
    if (authorityTabs) update.authorityTabs = authorityTabs;
    await ref.set(update, { merge: true });
    const config = await getConfigDoc();
    res.json({ config });
  } catch (err) {
    console.error('update tab config error', err);
    res.status(500).json({ error: 'Failed to update tab configuration' });
  }
});

module.exports = router;
