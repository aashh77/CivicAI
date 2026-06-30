const { firestore } = require('../config/firebase');
const { COLLECTIONS } = require('../config/constants');

/**
 * Predicts resolution timeframe based on current queue load and visual priority tier.
 * @param {string} departmentId - Target handling department
 * @param {string} criticality - 'low', 'medium', or 'high'
 */
async function predictResolutionTime(departmentId, criticality) {
  try {
    // Look up how many unresolved tasks this specific department currently has open
    const issuesRef = firestore.collection(COLLECTIONS.ISSUES);
    const activeQueueSnap = await issuesRef
      .where('departmentId', '==', departmentId)
      .where('status', 'in', ['assigned', 'in_progress'])
      .get();

    const backlogCount = activeQueueSnap.size;

    // Baseline turnaround window weights based on severity (in days)
    let baseDays = 7;
    if (criticality === 'high') baseDays = 2;
    if (criticality === 'medium') baseDays = 5;

    // Scale delay factor slightly dynamically based on current live backlogs (+1 day per 5 open issues)
    const queueDelay = Math.floor(backlogCount / 5);
    const totalPredictedDays = baseDays + queueDelay;

    if (totalPredictedDays <= 2) return '24-48 Hours';
    return `${totalPredictedDays} Days Estimated`;
  } catch (error) {
    console.error('Prediction system failure:', error);
    return '7-10 Days'; // Safe universal fallback duration
  }
}

module.exports = { predictResolutionTime };