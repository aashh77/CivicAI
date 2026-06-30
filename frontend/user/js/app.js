const user = requireRole(['citizen'], '/user/login.html');
document.getElementById('userName').textContent = user.name;

const TAB_LABELS = {
  dashboard: { label: 'Dashboard', icon: '📊' },
  report: { label: 'Report an Issue', icon: '➕' },
  my_issues: { label: 'My Issues', icon: '📋' },
  nearby: { label: 'Nearby Issues', icon: '🗺️' },
  leaderboard: { label: 'Leaderboard', icon: '🏆' },
  profile: { label: 'Profile', icon: '👤' },
};

let activeTab = 'dashboard';
let leafletMap = null;
let selectedFile = null;

async function init() {
  await refreshProfile();
  const { config } = await Api.get('/api/config/tabs');
  const userTabs = config.userTabs || {};
  renderNav(userTabs);
  const firstVisible = Object.keys(TAB_LABELS).find((id) => userTabs[id] !== false) || 'dashboard';
  showTab(firstVisible);
}

function renderNav(userTabs) {
  const nav = document.getElementById('navItems');
  nav.innerHTML = '';
  Object.keys(TAB_LABELS).forEach((tabId) => {
    if (userTabs[tabId] === false) return; // hidden by admin
    const div = document.createElement('div');
    div.className = 'nav-item' + (tabId === activeTab ? ' active' : '');
    div.id = `nav-${tabId}`;
    div.innerHTML = `<span>${TAB_LABELS[tabId].icon}</span> ${TAB_LABELS[tabId].label}`;
    div.onclick = () => showTab(tabId);
    nav.appendChild(div);
  });
}

function showTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = p.dataset.tab === tabId ? 'block' : 'none'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.id === `nav-${tabId}`));
  document.getElementById('pageTitle').textContent = TAB_LABELS[tabId].label;

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'my_issues') loadMyIssues();
  if (tabId === 'nearby') loadNearby();
  if (tabId === 'leaderboard') loadLeaderboard();
  if (tabId === 'profile') loadProfileTab();
}

async function refreshProfile() {
  try {
    const { user: u } = await Api.get('/api/user/profile');
    document.getElementById('pointsPill').textContent = `${u.points || 0} pts`;
    Api.setUser(u);
  } catch (e) { /* ignore */ }
}

// ---------------- DASHBOARD ----------------
async function loadDashboard() {
  const { issues } = await Api.get('/api/issues');
  const counts = { assigned: 0, in_progress: 0, resolved: 0, rejected: 0 };
  issues.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });

  document.getElementById('dashStats').innerHTML = `
    <div class="card stat-card"><div class="value">${issues.length}</div><div class="label">Total Reports</div></div>
    <div class="card stat-card"><div class="value">${counts.assigned || 0}</div><div class="label">Assigned</div></div>
    <div class="card stat-card"><div class="value">${counts.in_progress || 0}</div><div class="label">In Progress</div></div>
    <div class="card stat-card"><div class="value">${counts.resolved || 0}</div><div class="label">Resolved</div></div>
  `;

  document.getElementById('dashRecent').innerHTML = issues.slice(0, 5).map(issueCardHtml).join('') || '<div class="empty-state">No reports yet. File your first one!</div>';
}

// ---------------- REPORT ----------------
function onFileSelected(e) {
  selectedFile = e.target.files[0];
  if (!selectedFile) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('previewImg').src = ev.target.result;
    document.getElementById('previewImg').style.display = 'block';
    document.getElementById('uploadPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(selectedFile);
}

async function submitIssue() {
  if (!selectedFile) return alert('Please choose a photo of the issue');
  
  const title = document.getElementById('titleInput').value.trim();
  if (!title) return alert('Please enter a title for the report');

  const description = document.getElementById('descInput').value.trim();
  if (!description) return alert('Please enter a description detailing the issue');

  const address = document.getElementById('addressInput').value.trim();
  if (!address) return alert('Please enter the address of the issue');

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing with AI...';
  document.getElementById('reportResult').innerHTML = '';

  const fd = new FormData();
  fd.append('image', selectedFile);
  fd.append('title', title);
  fd.append('description', description);
  fd.append('addressText', address);

  try {
    const { issue, gamification } = await Api.postForm('/api/issues', fd);
    const cls = issue.locationVerification;
    
    document.getElementById('reportResult').innerHTML = `
      <div class="result-banner ${cls}">
        <strong>${cls === 'verified' ? '✅ Location Verified' : cls === 'unverified' ? '⚠️ Location Unverified' : 'ℹ️ No Photo GPS Found'}</strong><br/>
        ${issue.locationVerificationDetail}
      </div>
      <div class="result-banner" style="background:#e6f9ed;color:#137333;">
        <strong>🤖 AI Image Verification Match: ${issue.isAiVerified ? 'PASSED' : 'PENDING'}</strong><br/>
        ${issue.aiVerificationReason || 'The visual findings match the reported context details.'}
      </div>
      <div class="result-banner" style="background:#f3e8ff;color:#6b21a8;">
        <strong>⏳ Dynamic Turnaround Prediction</strong><br/>
        Assessed Severity: <strong>${(issue.criticality || 'medium').toUpperCase()}</strong><br/>
        Estimated Resolution Time: <strong>${issue.predictedTime || 'Calculating...'}</strong>
      </div>
      <div class="result-banner" style="background:#e2ebff;color:#2d5fff;">
        Routed to <strong>${issue.departmentName}</strong> under category <strong>${issue.categoryLabel}</strong>.
      </div>
      <div class="result-banner" style="background:#fdecd9;color:#d97b18;">
        🎉 You earned <strong>+${issue.pointsAwarded} points</strong>! Total: ${gamification.points} pts.
      </div>
    `;
    document.getElementById('pointsPill').textContent = `${gamification.points} pts`;
    document.getElementById('titleInput').value = '';
    document.getElementById('descInput').value = '';
    document.getElementById('addressInput').value = '';
    document.getElementById('previewImg').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    selectedFile = null;
  } catch (err) {
    document.getElementById('reportResult').innerHTML = `<div class="result-banner unverified">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze & Submit Report';
  }
}

// ---------------- MY ISSUES ----------------
async function loadMyIssues() {
  const { issues } = await Api.get('/api/issues');
  document.getElementById('myIssuesList').innerHTML = issues.map(issueCardHtml).join('') || '<div class="empty-state">No reports yet.</div>';
}

function issueCardHtml(issue) {
  // 👇 INTEGRATE THE SHARED BREACH CHECK HERE 👇
  // Check if the background worker or deadline math marks this report as overdue
  const isOverdue = typeof isTicketBreached === 'function' 
    ? isTicketBreached(issue) 
    : (issue.escalationLevel > 0 || (issue.slaDeadline && new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED'));

  // Define reassuring custom status boxes for the citizen instead of scary technical text
  let slaTrackingBlockHtml = '';

  if (issue.status !== 'resolved' && issue.status !== 'rejected') {
    if (isOverdue) {
      slaTrackingBlockHtml = `
        <div style="font-size: 13px; margin: 8px 0; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; padding: 10px; border-radius: 6px;">
          ⏳ <strong>Adjusting Operational Priority:</strong> We have experienced a slight volume delay. This report has been automatically re-prioritized and escalated to senior department supervisors to resolve it as quickly as possible. Thanks for your patience!
        </div>
      `;
    } else if (issue.predictedTime) {
      slaTrackingBlockHtml = `
        <p style="font-size: 13px; margin: 4px 0; color: #6b21a8; background: #f3e8ff; padding: 6px; border-radius: 4px;">
          ⏱️ <strong>Est. Resolution:</strong> ${issue.predictedTime} <span style="font-size:11px; color:#7e22ce;">(${issue.criticality || 'medium'} urgency)</span>
        </p>
      `;
    }
  }
  // 👆 END OF CITIZEN TRANSPARENCY BLOCK 👆

  return `
    <div class="issue-card" style="${isOverdue ? 'border: 1px solid #fde68a; background-color: #ffffff;' : ''}">
      <img src="${issue.image}" />
      <div class="body">
        <h3>${issue.title}</h3>
        <p>${issue.description || 'No description provided.'}</p>
        <p>📍 ${issue.location?.resolvedAddress || issue.location?.addressText || 'Unknown location'}</p>
        
        ${issue.aiVerificationReason ? `
          <p style="font-size: 13px; margin: 4px 0; color: var(--color-text-muted); background: #f1f3f4; padding: 6px; border-radius: 4px;">
            <strong>AI Note:</strong> ${issue.aiVerificationReason}
          </p>
        ` : ''}

        <!-- Inject the dynamic status tracking block -->
        ${slaTrackingBlockHtml}

        <div class="issue-meta">
          <span class="badge ${statusBadgeClass(issue.status)}">${issue.status.replace('_',' ')}</span>
          <span class="badge badge-blue">${issue.categoryLabel}</span>
          <span class="badge ${issue.isAiVerified ? 'badge-green' : 'badge-orange'}">${issue.isAiVerified ? 'AI Verified' : 'Unverified'}</span>
          <span style="color:var(--color-text-muted);font-size:12.5px;">${timeAgo(issue.createdAt)}</span>
          ${issue.resolvedImage ? `<a href="#" onclick="alert('Resolved! Repaired image was uploaded by the authority.'); return false;" style="font-size:12.5px;">View fix ✓</a>` : ''}
        </div>
      </div>
    </div>`;
}

// ---------------- NEARBY ----------------
async function loadNearby() {
  const { issues } = await Api.get('/api/issues/public/feed');
  if (!leafletMap) {
    leafletMap = L.map('map').setView([12.9716, 77.5946], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(leafletMap);
  }
  const located = issues.filter((i) => i.location && i.location.lat && i.location.lng);
  
  located.forEach((i) => {
    L.marker([parseFloat(i.location.lat), parseFloat(i.location.lng)]).addTo(leafletMap)
      .bindPopup(`
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 160px; padding: 2px;">
          <strong style="display: block; font-size: 13px; color: #1e293b; margin-bottom: 4px;">⚠️ ${i.title}</strong>
          <span style="font-size: 11px; font-weight: 600; color: #4f46e5; background: #eef2ff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px;">
            ${i.category || 'Civic Issue'}
          </span>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
            📍 ${i.location.resolvedAddress || i.location.addressText || ''}
          </div>
          <span class="badge ${statusBadgeClass(i.status)}" style="font-size: 10px; padding: 3px 6px;">
            ${i.status.toUpperCase().replace('_', ' ')}
          </span>
        </div>
      `);
  });

  if (located.length) {
    leafletMap.setView([parseFloat(located[0].location.lat), parseFloat(located[0].location.lng)], 13);
  }

  document.getElementById('nearbyList').innerHTML = issues.slice(0, 15).map((i) => `
    <div class="issue-card" style="align-items:center;">
      <div class="body">
        <h3>${i.title}</h3>
        <p>${i.category} · ${i.location?.resolvedAddress || i.location?.addressText || ''}</p>
        <span class="badge ${statusBadgeClass(i.status)}">${i.status.replace('_',' ')}</span>
      </div>
    </div>`).join('');
}

// ---------------- LEADERBOARD ----------------
async function loadLeaderboard() {
  const { leaderboard } = await Api.get('/api/user/leaderboard');
  document.getElementById('leaderboardBody').innerHTML = leaderboard.map((u, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${u.name}</td>
      <td>${u.points}</td>
      <td>${u.reportCount}</td>
      <td>${(u.badges || []).join(', ') || '—'}</td>
    </tr>`).join('');
}

// ---------------- PROFILE ----------------
async function loadProfileTab() {
  const { user: u } = await Api.get('/api/user/profile');
  document.getElementById('profileName').textContent = u.name;
  document.getElementById('profileEmail').textContent = u.email;
  document.getElementById('profilePoints').textContent = u.points || 0;
  document.getElementById('profileReports').textContent = u.reportCount || 0;
  document.getElementById('profileBadges').innerHTML = (u.badges || []).map((b) => `<span class="badge badge-blue" style="margin-right:6px;">${b.replace('_',' ')}</span>`).join('') || '<span style="color:var(--color-text-muted);">No badges yet - keep reporting!</span>';
}

init();