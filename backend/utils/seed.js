const { firestore } = require('../config/firebase');
const { COLLECTIONS, ROLES, DEPARTMENTS } = require('../config/constants');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Default predictable authority configurations for local development and testing
const DEFAULT_AUTHORITIES = [
  {
    email: 'admin@city.gov',
    name: 'Central Admin',
    role: ROLES.ADMIN,
    password: 'pass'
  },

  // --- AUTHORITIES (DEPARTMENTS) ---
  {
    email: 'roads@city.gov',
    name: 'Roads & Potholes Dept Admin',
    role: ROLES.AUTHORITY,
    departmentId: 'roads',
    password: 'pass'
  },
  {
    email: 'water@city.gov',
    name: 'Water Supply Dept Admin',
    role: ROLES.AUTHORITY,
    departmentId: 'water',
    password: 'pass'
  },
  {
    email: 'light@city.gov',
    name: 'Streetlight & Electrical Dept Admin',
    role: ROLES.AUTHORITY,
    departmentId: 'electrical',
    password: 'pass'
  },
  {
    email: 'sanitation@city.gov',
    name: 'Waste Management Dept Admin',
    role: ROLES.AUTHORITY,
    departmentId: 'sanitation',
    password: 'pass'
  },
  {
    email: 'publicworks@city.gov',
    name: 'General Public Works Admin',
    role: ROLES.AUTHORITY,
    departmentId: 'public_works',
    password: 'pass'
  },

  // --- CITIZENS ---
  {
    email: 'citizen1@test.com',
    name: 'John Doe',
    role: ROLES.CITIZEN,
    password: 'pass'
  },
  {
    email: 'citizen2@test.com',
    name: 'Jane Smith',
    role: ROLES.CITIZEN,
    password: 'pass'
  }
];

async function bootstrap() {
  const usersRef = firestore.collection(COLLECTIONS.USERS);
  
  // 1. Existing Logic: Seed Default Administrator Account
  const adminSnap = await usersRef.where('role', '==', ROLES.ADMIN).limit(1).get();

  if (adminSnap.empty) {
    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@civicplatform.local').toLowerCase();
    const passwordHash = await bcrypt.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMe123!', 10);
    const uid = uuidv4();
    await usersRef.doc(uid).set({
      uid,
      name: process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Admin',
      email,
      passwordHash,
      role: ROLES.ADMIN,
      points: 0,
      reportCount: 0,
      badges: [],
      createdAt: new Date().toISOString(),
    });
    console.log(`[bootstrap] Created default admin account: ${email}`);
  } else {
    console.log('[bootstrap] Admin account already exists - skipping');
  }

  // 2. Existing Logic: Seed Default Departments configuration
  const deptRef = firestore.collection(COLLECTIONS.DEPARTMENTS);
  for (const dept of DEPARTMENTS) {
    const docRef = deptRef.doc(dept.id);
    const snap = await docRef.get();
    if (!snap.exists) {
      await docRef.set(dept);
    }
  }
  console.log('[bootstrap] Departments seeded');

  // 3. New Logic: Seed Default Authority Logins into Firestore
  console.log('[bootstrap] Synchronizing default authority profiles...');
  for (const auth of DEFAULT_AUTHORITIES) {
    const authoritySnap = await usersRef.where('email', '==', auth.email.toLowerCase()).limit(1).get();
    
    if (authoritySnap.empty) {
      const passwordHash = await bcrypt.hash(auth.password, 10);
      const uid = uuidv4();
      
      await usersRef.doc(uid).set({
        uid,
        name: auth.name,
        email: auth.email.toLowerCase(),
        passwordHash,
        role: auth.role,
        departmentId: auth.departmentId,
        points: 0,
        reportCount: 0,
        badges: ['OFFICIAL'],
        createdAt: new Date().toISOString()
      });
      console.log(`  ✓ Created default authority account: ${auth.email}`);
    }
  }
  console.log('[bootstrap] Authority accounts synchronized successfully.');
}

module.exports = { bootstrap };

if (require.main === module) {
  bootstrap()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Bootstrap failed', err);
      process.exit(1);
    });
}