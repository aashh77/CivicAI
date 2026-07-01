require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const issuesRoutes = require('./routes/issues.routes');
const adminRoutes = require('./routes/admin.routes');
const authorityRoutes = require('./routes/authority.routes');
const userRoutes = require('./routes/user.routes');
const configRoutes = require('./routes/config.routes');
const { bootstrap } = require('./utils/seed');

const { checkAndEscalateIssues } = require('./services/escalation.worker');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic abuse protection on the API surface
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 });
app.use('/api', apiLimiter);

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/authority', authorityRoutes);
app.use('/api/user', userRoutes);
app.use('/api/config', configRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Three separate static frontend portals, all served from this one backend ----
// Admin portal (this server's "home" - also where admin links out to the other two)
// ---- Three separate static frontend portals, all served from this one backend ----
const rootDir = process.cwd();

// Admin portal
app.use('/admin', express.static(path.join(rootDir, 'frontend', 'admin')));
// Citizen-facing reporting portal
app.use('/user', express.static(path.join(rootDir, 'frontend', 'user')));
// Authority/department portal
app.use('/authority', express.static(path.join(rootDir, 'frontend', 'authority')));
// Shared assets (where this api.js file lives!)
app.use('/shared', express.static(path.join(rootDir, 'frontend', 'shared')));

app.get('/', (req, res) => res.redirect('/admin'));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image file too large' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ---- REPLACE EVERYTHING BELOW YOUR UNHANDLED ERROR MIDDLEWARE WITH THIS ----

// Only run app.listen if running locally, otherwise export for Vercel serverless
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}...`);
  });
}

// Automatically trigger your escalation worker function when the backend wakes up
setTimeout(async () => {
  try {
    console.log("Starting proactive escalation sweep...");
    await checkAndEscalateIssues();
    console.log("Escalation sweep completed successfully.");
  } catch (err) {
    console.error("Worker sweep failed:", err);
  }
}, 1000);

module.exports = app;
