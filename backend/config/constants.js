// Central place for all "magic strings" so collections/categories stay consistent
// across routes and services.

const COLLECTIONS = {
  USERS: 'users',
  ISSUES: 'issues',
  CONFIG: 'config',
  DEPARTMENTS: 'departments',
  AUDIT_LOG: 'auditLog',
};

// Subcollection names (kept under issues/{id}/...) to avoid unbounded growth
// of the parent issue document (Firestore 1MB doc limit).
const SUBCOLLECTIONS = {
  VERIFICATIONS: 'verifications', // community upvotes/confirmations
  COMMENTS: 'comments',
};

const ROLES = {
  ADMIN: 'admin',
  CITIZEN: 'citizen',
  AUTHORITY: 'authority',
};

const ISSUE_STATUS = {
  REPORTED: 'reported', // just created, pending AI pipeline result
  ASSIGNED: 'assigned', // category resolved + routed to a department
  IN_PROGRESS: 'in_progress', // authority acknowledged / working on it
  RESOLVED: 'resolved', // authority uploaded proof of fix
  REJECTED: 'rejected', // authority/admin rejected as invalid/duplicate
};

const LOCATION_VERIFICATION = {
  VERIFIED: 'verified', // EXIF GPS matches user-provided address within tolerance
  UNVERIFIED: 'unverified', // EXIF GPS present but mismatched
  NO_METADATA: 'no_metadata', // image had no GPS EXIF data, trusting user address
};

// Departments and the category keywords routed to them.
// AI label -> category -> department is resolved in categorization.service.js
const DEPARTMENTS = [
  {
    id: 'roads',
    name: 'Roads & Potholes Department',
    categories: ['pothole', 'road_damage'],
  },
  {
    id: 'water',
    name: 'Water Supply & Leakage Department',
    categories: ['water_leakage', 'drainage'],
  },
  {
    id: 'electrical',
    name: 'Streetlight & Electrical Department',
    categories: ['streetlight', 'electrical_hazard'],
  },
  {
    id: 'sanitation',
    name: 'Waste Management & Sanitation Department',
    categories: ['waste_management', 'garbage'],
  },
  {
    id: 'public_works',
    name: 'General Public Infrastructure Department',
    categories: ['infrastructure', 'other'],
  },
];

// Tabs that can be toggled on/off independently for the user portal and
// authority portal by the admin. The admin portal always has all of them.
const AVAILABLE_TABS = [
  { id: 'dashboard', label: 'Dashboard', portals: ['user', 'authority'] },
  { id: 'report', label: 'Report an Issue', portals: ['user'] },
  { id: 'my_issues', label: 'My Issues', portals: ['user'] },
  { id: 'nearby', label: 'Nearby Issues / Community Feed', portals: ['user'] },
  { id: 'leaderboard', label: 'Points & Leaderboard', portals: ['user'] },
  { id: 'assigned_issues', label: 'Assigned Issues (includes Resolve action)', portals: ['authority'] },
  { id: 'department_analytics', label: 'Department Analytics', portals: ['authority'] },
  { id: 'profile', label: 'Profile', portals: ['user', 'authority'] },
];

const POINTS = {
  REPORT_ISSUE: 10,
  COMMUNITY_VERIFICATION_RECEIVED: 5, // awarded to reporter when another citizen verifies
  COMMUNITY_VERIFICATION_GIVEN: 2, // awarded to the verifying citizen
  ISSUE_RESOLVED_BONUS: 20,
};

const BADGES = [
  { id: 'first_report', label: 'First Responder', minPoints: 0, minReports: 1 },
  { id: 'active_citizen', label: 'Active Citizen', minPoints: 100, minReports: 5 },
  { id: 'community_hero', label: 'Community Hero', minPoints: 300, minReports: 15 },
  { id: 'civic_champion', label: 'Civic Champion', minPoints: 750, minReports: 30 },
];

module.exports = {
  COLLECTIONS,
  SUBCOLLECTIONS,
  ROLES,
  ISSUE_STATUS,
  LOCATION_VERIFICATION,
  DEPARTMENTS,
  AVAILABLE_TABS,
  POINTS,
  BADGES,
};
