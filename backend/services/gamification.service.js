const { firestore } = require('../config/firebase');
const { COLLECTIONS, POINTS, BADGES } = require('../config/constants');

/**
 * Atomically increments a user's points (and reportCount when relevant)
 * using a Firestore transaction-safe FieldValue increment, then recomputes
 * badges. Returns the updated points/badges so callers can surface them
 * immediately (e.g. in the API response after reporting an issue).
 */
async function awardPoints(uid, points, { incrementReportCount = false } = {}) {
  const { FieldValue } = require('@google-cloud/firestore');
  const userRef = firestore.collection(COLLECTIONS.USERS).doc(uid);

  const update = { points: FieldValue.increment(points) };
  if (incrementReportCount) update.reportCount = FieldValue.increment(1);

  await userRef.update(update);

  const snap = await userRef.get();
  const user = snap.data();
  const earnedBadges = BADGES.filter(
    (b) => (user.points || 0) >= b.minPoints && (user.reportCount || 0) >= b.minReports
  ).map((b) => b.id);

  if (JSON.stringify(earnedBadges) !== JSON.stringify(user.badges || [])) {
    await userRef.update({ badges: earnedBadges });
  }

  return { points: user.points || 0, badges: earnedBadges };
}

async function getLeaderboard(limit = 20) {
  // Single equality filter only (no orderBy chained) so this runs with zero
  // composite-index setup; ranking is then done in-memory on the small result set.
  const snap = await firestore.collection(COLLECTIONS.USERS).where('role', '==', 'citizen').get();

  return snap.docs
    .map((d) => ({
      uid: d.id,
      name: d.data().name,
      points: d.data().points || 0,
      badges: d.data().badges || [],
      reportCount: d.data().reportCount || 0,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

module.exports = { awardPoints, getLeaderboard };
