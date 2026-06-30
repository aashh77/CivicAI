const { firestore } = require('../config/firebase');
const { COLLECTIONS, ISSUE_STATUS } = require('../config/constants');

/**
 * SLA Tracking & Escalation Worker
 * Sweeps Firestore for overdue active tickets and raises their priority.
 */
async function checkAndEscalateIssues() {
  const now = new Date();
  const nowIso = now.toISOString();
  console.log(`[SLA Worker] Running database sweep at ${nowIso}...`);
  
  try {
    // 1. Query Firestore for issues that are active but past their deadline
    const overdueSnapshot = await firestore.collection(COLLECTIONS.ISSUES)
      .where('status', 'in', [ISSUE_STATUS.ASSIGNED, ISSUE_STATUS.IN_PROGRESS])
      .where('slaDeadline', '<', nowIso)
      .where('escalationLevel', '==', 0) // Only pick up newly breached tickets
      .get();

    if (overdueSnapshot.empty) {
      console.log('[SLA Worker] Clean sweep! No breached deadlines found.');
      return;
    }

    console.log(`[SLA Worker] Found ${overdueSnapshot.size} breached tickets. Processing escalation batch...`);
    const batch = firestore.batch();

    overdueSnapshot.forEach((doc) => {
      const issueRef = firestore.collection(COLLECTIONS.ISSUES).doc(doc.id);
      const data = doc.data();

      // 2. Escalate the properties
      batch.update(issueRef, {
        escalationLevel: 1,
        criticality: 'high', // Force bump status priority to urgent
        updatedAt: nowIso,
        aiVerificationReason: `${data.aiVerificationReason || ''} [SLA BREACH AUTOMATICALLY ESCALATED ON ${nowIso}]`
      });
      
      console.log(`🚨 [ESCALATED] Ticket #${doc.id.substring(0, 8)} (${data.title}) missed deadline!`);
    });

    // 3. Commit all changes to Firestore concurrently
    await batch.commit();
    console.log('[SLA Worker] Batch escalation successfully saved to database.');
  } catch (error) {
    console.error('[SLA Worker Error] Critical failure during deadline sweep:', error);
  }
}

module.exports = { checkAndEscalateIssues };