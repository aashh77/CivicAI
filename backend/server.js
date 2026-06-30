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
app.use('/admin', express.static(path.join(__dirname, '..', 'frontend', 'admin')));
// Citizen-facing reporting portal
app.use('/user', express.static(path.join(__dirname, '..', 'frontend', 'user')));
// Authority/department portal
app.use('/authority', express.static(path.join(__dirname, '..', 'frontend', 'authority')));
// Shared assets (common css/js used by more than one portal, if any)
app.use('/shared', express.static(path.join(__dirname, '..', 'frontend', 'shared')));

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

app.listen(PORT, async () => {
  console.log(`Civic Issue Platform backend running on port ${PORT}`);
  console.log(`  Admin portal:     http://localhost:${PORT}/admin`);
  console.log(`  Citizen portal:   http://localhost:${PORT}/user`);
  console.log(`  Authority portal: http://localhost:${PORT}/authority`);
  try {
    await bootstrap();
    console.log('Initializing SLA Deadline Monitoring Worker Engine...');
    
    // Run an initial sweep immediately on startup
    await checkAndEscalateIssues();
    
    // Set up a loop to automatically run the sweep every 60 minutes
    const ONE_HOUR_MS = 60 * 60 * 1000;
    setInterval(async () => {
      await checkAndEscalateIssues();
    }, ONE_HOUR_MS);
  } catch (err) {
    console.error('Startup bootstrap failed (server still running):', err.message);
  }
});
