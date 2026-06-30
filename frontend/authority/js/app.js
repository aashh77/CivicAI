const authUser = requireRole(['authority'], '/authority/login.html');
document.getElementById('userName').textContent = authUser.name;
document.getElementById('deptLabel').textContent = authUser.department;
document.getElementById('profileName').textContent = authUser.name;
document.getElementById('profileDept').textContent = `Department: ${authUser.department}`;

const TAB_LABELS = {
  dashboard: { label: 'Dashboard', icon: '📊' },
  assigned_issues: { label: 'Assigned Issues', icon: '📋' },
  department_analytics: { label: 'Department Analytics', icon: '📈' },
  profile: { label: 'Profile', icon: '👤' },
};

let activeTab = 'dashboard';
let currentStatusFilter = 'assigned';
let resolvingIssueId = null;
let issueMap = null; // 👈 Global tracking variable for Leaflet instance

async function init() {
  const { config } = await Api.get('/api/config/tabs');
  const authorityTabs = config.authorityTabs || {};
  renderNav(authorityTabs);
  const firstVisible = Object.keys(TAB_LABELS).find((id) => authorityTabs[id] !== false) || 'dashboard';
  showTab(firstVisible);
}

function renderNav(authorityTabs) {
  const nav = document.getElementById('navItems');
  nav.innerHTML = '';
  Object.keys(TAB_LABELS).forEach((tabId) => {
    if (authorityTabs[tabId] === false) return;
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

  // Handle map container rendering checks
  initLeafletMapIfNeeded();

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'assigned_issues') loadIssues();
  if (tabId === 'department_analytics') loadAnalytics();
}

// 👈 NEW: Safely spins up Leaflet without breaking on hidden elements
function initLeafletMapIfNeeded() {
  const mapEl = document.getElementById('issueMap');
  if (!mapEl || issueMap) {
    if (issueMap) issueMap.invalidateSize(); // Force recalculate dimensions if layout shifted
    return;
  }

  // Fallback default coordinates if your system uses center settings
  issueMap = L.map('issueMap').setView([40.7128, -74.0060], 11); 
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(issueMap);
}

// 👈 NEW: Plots issue positions using your verification matrix styles
function plotIssuesOnMap(issues) {
  if (!issueMap || !Array.isArray(issues)) return;

  // Clear existing layers/markers from previous renders
  issueMap.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      issueMap.removeLayer(layer);
    }
  });

  const validBounds = [];

  issues.forEach(issue => {
    const lat = issue.location?.lat;
    const lng = issue.location?.lng;

    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      validBounds.push([parsedLat, parsedLng]);

      const isVerified = issue.locationVerification === 'verified' || issue.locationVerification === 'verified_text_only';
      const verifyLabel = issue.locationVerification === 'verified' ? '✅ VERIFIED MATCH' : issue.locationVerification === 'unverified' ? '🚨 LOCATION MISMATCH' : 'ℹ️ TEXT ONLY';
      const badgeColor = issue.locationVerification === 'verified' ? '#16a34a' : issue.locationVerification === 'unverified' ? '#dc2626' : '#d97706';

      const marker = L.marker([parsedLat, parsedLng]).addTo(issueMap);
      
      marker.bindPopup(`
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px;">
          <strong style="display:block; font-size:13px; margin-bottom:4px;">📌 ${issue.title || 'Civic Incident'}</strong>
          
          <div style="font-size:10px; font-weight:bold; margin-bottom:6px; color:${badgeColor};">
            ${verifyLabel}
          </div>

          <div style="font-size:11px; margin-bottom:4px; color:#475569;">
            Urgency: <strong style="color:${issue.criticality === 'high' ? '#dc2626' : '#d97706'};">${(issue.criticality || 'medium').toUpperCase()}</strong>
          </div>
          <div style="font-size:11px; margin-bottom:6px; color:#475569;">
            Est. Window: <strong>${issue.predictedTime || 'Calculating...'}</strong>
          </div>
          
          <p style="margin:4px 0; font-size:11px; color:#334155; background:#f8fafc; padding:4px; border-radius:4px; border:1px solid #e2e8f0;">
            ${issue.location?.resolvedAddress || issue.location?.addressText || ''}
          </p>
          <p style="margin:4px 0 0; font-size:10px; color:#64748b; font-style:italic;">
            ${issue.locationVerificationDetail || ''}
          </p>
        </div>
      `);
    }
  });

  // Dynamically pan/zoom the map to contain visible department issues
  if (validBounds.length > 0) {
    issueMap.fitBounds(validBounds, { padding: [30, 30] });
  }
}

async function loadDashboard() {
  const { assigned, inProgress, resolved } = await Api.get('/api/authority/summary');
  document.getElementById('dashStats').innerHTML = `
    <div class="card stat-card"><div class="value">${assigned}</div><div class="label">New / Assigned</div></div>
    <div class="card stat-card"><div class="value">${inProgress}</div><div class="label">In Progress</div></div>
    <div class="card stat-card"><div class="value">${resolved}</div><div class="label">Resolved</div></div>
  `;
  
  // Optional: If map sits on Dashboard tab, pull all department issues to plot summary overview
  try {
    const { issues } = await Api.get('/api/issues'); // Scoped to authority's dept on backend side
    plotIssuesOnMap(issues);
  } catch (err) {
    console.error('Failed to plot dashboard map indicators:', err);
  }
}

async function loadAnalytics() {
  const { assigned, inProgress, resolved } = await Api.get('/api/authority/summary');
  const total = assigned + inProgress + resolved || 1;
  document.getElementById('analyticsStats').innerHTML = `
    <div class="card stat-card"><div class="value">${Math.round((resolved/total)*100)}%</div><div class="label">Resolution Rate</div></div>
    <div class="card stat-card"><div class="value">${total}</div><div class="label">Total Handled</div></div>
    <div class="card stat-card"><div class="value">${resolved}</div><div class="label">Successfully Closed</div></div>
  `;
}

function filterStatus(status) {
  currentStatusFilter = status;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === status));
  loadIssues();
}

async function loadIssues() {
  const { issues } = await Api.get(`/api/issues?status=${currentStatusFilter}`);
  
  // 👈 Plot filtered pins contextually every time an operational status tab updates
  plotIssuesOnMap(issues);

  document.getElementById('issueList').innerHTML = issues.map((issue) => {
    const critColor = issue.criticality === 'high' ? '#dc2626' : issue.criticality === 'low' ? '#16a34a' : '#d97706';
    const critBg = issue.criticality === 'high' ? '#fef2f2' : issue.criticality === 'low' ? '#f0fdf4' : '#fffbeb';

    const isOverdue = typeof isTicketBreached === 'function' 
      ? isTicketBreached(issue) 
      : (issue.escalationLevel > 0 || (issue.slaDeadline && new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED'));

    return `
    <div class="issue-card">
      <img src="${issue.image}" />
      <div class="body">
        <h3>${issue.title}</h3>
        <p>${issue.description || ''}</p>
        <p>📍 ${issue.location?.resolvedAddress || issue.location?.addressText || 'Unknown'}</p>
        
        <div style="margin: 8px 0; display: flex; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 4px; background: ${critBg}; color: ${critColor}; border: 1px solid ${critColor}33;">
            🚨 AI Priority: ${(issue.criticality || 'medium').toUpperCase()}
          </span>
          ${issue.predictedTime ? `
            <span style="font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 4px; background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff;">
              ⏱️ SLA Resolution Target: ${issue.predictedTime}
            </span>
          ` : ''}
        </div>

        <div class="issue-meta">
          <span class="badge ${statusBadgeClass(issue.status)}">${issue.status.replace('_',' ')}</span>
          <span class="badge badge-blue">${issue.categoryLabel}</span>
          <span class="badge ${issue.locationVerification === 'verified' ? 'badge-green' : issue.locationVerification === 'unverified' ? 'badge-red' : 'badge-orange'}">${issue.locationVerification.replace('_',' ')}</span>
          <span style="color:var(--color-text-muted);font-size:12.5px;">Reported by ${issue.reporterName} · ${timeAgo(issue.createdAt)}</span>
        </div>
        
        <div style="margin-top:10px;display:flex;gap:8px;">
          ${issue.status === 'assigned' ? `<button class="btn secondary" onclick="updateStatus('${issue.id}','in_progress')">Start Work</button>` : ''}
          ${issue.status !== 'resolved' && issue.status !== 'rejected' ? `<button class="btn success" onclick="openResolveModal('${issue.id}')">Mark Resolved</button>` : ''}
          ${issue.status === 'assigned' ? `<button class="btn danger" onclick="updateStatus('${issue.id}','rejected')">Reject</button>` : ''}
          ${issue.resolvedImage ? `<img src="${issue.resolvedImage}" style="width:60px;height:48px;object-fit:cover;border-radius:6px;" title="Resolved photo" />` : ''}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">No issues in this category.</div>';
}

async function updateStatus(issueId, status) {
  try {
    await Api.patch(`/api/issues/${issueId}/status`, { status });
    loadIssues();
  } catch (err) {
    alert(err.message);
  }
}

function openResolveModal(issueId) {
  resolvingIssueId = issueId;
  document.getElementById('resolveModal').style.display = 'flex';
}
function closeResolveModal() {
  resolvingIssueId = null;
  document.getElementById('resolveModal').style.display = 'none';
  document.getElementById('resolveFile').value = '';
  document.getElementById('resolveNote').value = '';
}
async function confirmResolve() {
  const file = document.getElementById('resolveFile').files[0];
  if (!file) return alert('Please upload the repaired/resolved photo');
  const fd = new FormData();
  fd.append('image', file);
  fd.append('note', document.getElementById('resolveNote').value.trim());
  try {
    await Api.postForm(`/api/issues/${resolvingIssueId}/resolve`, fd);
    closeResolveModal();
    loadIssues();
    alert('Issue marked resolved. Reporter notified via points + status update.');
  } catch (err) {
    alert(err.message);
  }
}

init();