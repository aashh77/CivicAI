const adminUser = requireRole(['admin'], '/admin/login.html');
document.getElementById('userName').textContent = adminUser.name;

let departments = [];
let availableTabs = [];
let tabConfig = { userTabs: {}, authorityTabs: {} };
let issueMap = null; // Clean placement for map instance

// ---------------- TAB NAVIGATION OVERHAUL ----------------
function showTab(tabId) {
  // Toggle Visibility Panels
  document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = p.dataset.tab === tabId ? 'block' : 'none'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.id === `nav-${tabId}`));
  
  // Added 'map' layout title support here 👇
  const titles = { 
    dashboard: 'Dashboard', 
    issues: 'All Issues', 
    map: 'Live Incident Map',
    users: 'Users & Authorities', 
    customize: 'Customize Portals', 
    portals: 'Open Portals' 
  };
  document.getElementById('pageTitle').textContent = titles[tabId] || 'Admin Console';

  // Core Router Handlers
  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'issues') loadAllIssues();
  if (tabId === 'map') initAdminMap(); // 🗺️ Direct, reliable activation point
  if (tabId === 'users') loadUsers();
  if (tabId === 'customize') loadCustomize();
}

// Make sure it hooks globally into your sidebar HTML elements
window.showTab = showTab;

async function init() {
  const { departments: d } = await Api.get('/api/admin/departments');
  departments = d;
  ['filterDept', 'newDept'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    departments.forEach((dep) => {
      const opt = document.createElement('option');
      opt.value = dep.id; opt.textContent = dep.name;
      sel.appendChild(opt.cloneNode(true));
    });
  });
  showTab('dashboard');
}

// ---------------- DASHBOARD ----------------
async function loadDashboard() {
  const stats = await Api.get('/api/admin/stats');
  document.getElementById('dashStats').innerHTML = `
    <div class="card stat-card"><div class="value">${stats.total}</div><div class="label">Total Issues</div></div>
    <div class="card stat-card"><div class="value">${stats.resolved}</div><div class="label">Resolved</div></div>
    <div class="card stat-card"><div class="value">${stats.unverifiedLocation}</div><div class="label">Flagged Location Mismatch</div></div>
    <div class="card stat-card"><div class="value">${stats.totalUsers}</div><div class="label">Total Accounts</div></div>
  `;
  document.getElementById('deptBreakdown').innerHTML = Object.entries(stats.byDepartment).map(([id, d]) => `
    <div class="toggle-row"><span>${d.name}</span><strong>${d.count} issues</strong></div>
  `).join('');
}

// ---------------- ISSUES ----------------
async function loadAllIssues() {
  const status = document.getElementById('filterStatus').value;
  const dept = document.getElementById('filterDept').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (dept) params.set('department', dept);
  const { issues } = await Api.get(`/api/issues?${params.toString()}`);
  
  document.getElementById('adminIssueList').innerHTML = issues.map((issue) => {
    // Dynamic styling configuration blocks matching our authority triage metrics
    const critColor = issue.criticality === 'high' ? '#dc2626' : issue.criticality === 'low' ? '#16a34a' : '#d97706';
    const critBg = issue.criticality === 'high' ? '#fef2f2' : issue.criticality === 'low' ? '#f0fdf4' : '#fffbeb';

    const isOverdue = typeof isTicketBreached === 'function' 
      ? isTicketBreached(issue) 
      : (issue.escalationLevel > 0 || (issue.slaDeadline && new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED'));

    // Dynamic style definitions based on operational breach status
    const cardStyles = isOverdue 
      ? 'border: 2px solid #dc2626; background-color: #fff5f5; position: relative;' 
      : 'border: 1px solid #e2e8f0; background-color: #ffffff;';

    const adminAlertBannerHtml = isOverdue 
      ? `<div style="background: #dc2626; color: white; padding: 4px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin: -12px -12px 12px -12px; border-radius: 4px 4px 0 0; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> SLA BREACHED — AUTOMATICALLY ESCALATED
         </div>` 
      : '';

    return `
    <div class="issue-card">
      <img src="${issue.image}" />
      <div class="body">
        <h3>${issue.title}</h3>
        <p>${issue.description || ''}</p>
        <p>📍 ${issue.location?.resolvedAddress || issue.location?.addressText || 'Unknown'} &nbsp; → ${issue.departmentName}</p>
        
        <!-- INJECTED TRIAGE METRICS ROW: Exposes backend priority models safely to system administrators -->
        <div style="margin: 8px 0; display: flex; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 11px; font-weight: bold; padding: 3px 6px; border-radius: 4px; background: ${critBg}; color: ${critColor}; border: 1px solid ${critColor}33;">
            🚨 PRIORITY: ${(issue.criticality || 'medium').toUpperCase()}
          </span>
          ${issue.predictedTime ? `
            <span style="font-size: 11px; font-weight: bold; padding: 3px 6px; border-radius: 4px; background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff;">
              ⏱️ BACKLOG TARGET SLA: ${issue.predictedTime}
            </span>
          ` : ''}
        </div>

        <div class="issue-meta">
          <span class="badge ${statusBadgeClass(issue.status)}">${issue.status.replace('_',' ')}</span>
          <span class="badge badge-blue">${issue.categoryLabel}</span>
          <span class="badge ${issue.locationVerification === 'verified' ? 'badge-green' : issue.locationVerification === 'unverified' ? 'badge-red' : 'badge-orange'}">${issue.locationVerification.replace('_',' ')}</span>
          <span style="color:var(--color-text-muted);font-size:12.5px;">Reported by ${issue.reporterName} · ${timeAgo(issue.createdAt)}</span>
        </div>
        ${issue.resolvedImage ? `<div style="margin-top:8px;font-size:12.5px;color:var(--color-success);">✓ Resolved by ${issue.resolvedByName || 'authority'} — <img src="${issue.resolvedImage}" style="width:50px;height:40px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-left:6px;" /></div>` : ''}
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">No issues match these filters.</div>';
}

// ---------------- USERS ----------------
function toggleDeptField() {
  const isAuthority = document.getElementById('newRole').value === 'authority';
  const field = document.getElementById('deptField');
  if (field) field.style.display = isAuthority ? 'block' : 'none';
}
toggleDeptField();

async function loadUsers() {
  const { users } = await Api.get('/api/admin/users');
  document.getElementById('usersBody').innerHTML = users.map((u) => `
    <tr>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span class="badge badge-blue">${u.role}</span></td>
      <td>${u.department || '—'}</td>
      <td>${u.points || 0}</td>
      <td>${u.uid !== adminUser.uid ? `<button class="btn danger" style="padding:5px 10px;font-size:12px;" onclick="deleteUser('${u.uid}')">Delete</button>` : ''}</td>
    </tr>`).join('');
}

async function createUser() {
  const name = document.getElementById('newName').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const department = document.getElementById('newDept').value;
  if (!name || !email || !password) return alert('All fields are required');
  try {
    await Api.post('/api/admin/users', { name, email, password, role, department });
    ['newName','newEmail','newPassword'].forEach((id) => document.getElementById(id).value = '');
    loadUsers();
    alert('Account created successfully');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(uid) {
  if (!confirm('Delete this account?')) return;
  await Api.delete(`/api/admin/users/${uid}`);
  loadUsers();
}

// ---------------- CUSTOMIZE ----------------
async function loadCustomize() {
  const data = await Api.get('/api/config/tabs');
  tabConfig = data.config;
  availableTabs = data.availableTabs;

  document.getElementById('userTabToggles').innerHTML = availableTabs
    .filter((t) => t.portals.includes('user'))
    .map((t) => toggleRowHtml(t, 'userTabs')).join('');

  document.getElementById('authorityTabToggles').innerHTML = availableTabs
    .filter((t) => t.portals.includes('authority'))
    .map((t) => toggleRowHtml(t, 'authorityTabs')).join('');
}

function toggleRowHtml(tab, group) {
  const checked = tabConfig[group][tab.id] !== false;
  return `
    <div class="toggle-row">
      <span>${tab.label}</span>
      <label class="switch-toggle">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="onToggleTab('${group}','${tab.id}', this.checked)" />
        <span class="slider"></span>
      </label>
    </div>`;
}

async function onToggleTab(group, tabId, value) {
  tabConfig[group][tabId] = value;
  try {
    await Api.put('/api/config/tabs', { [group]: tabConfig[group] });
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

// ---------------- MAP ENGINE ----------------
function initAdminMap() {
  if (!issueMap) {
    // Center map view on your target region
    issueMap = L.map('adminMap').setView([40.7128, -74.0060], 12);

    // Use a compatible raster tile URL layer template 👇
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(issueMap);

    plotIssuesOnMap();
    
    setTimeout(() => {
      issueMap.invalidateSize();
    }, 100);

  } else {
    setTimeout(() => {
      issueMap.invalidateSize();
    }, 100);
  }
}

async function plotIssuesOnMap() {
  try {
    let issues = [];
    try {
      const res = await Api.get('/api/issues');
      issues = res.issues || res;
    } catch {
      const response = await fetch('/api/issues');
      if (response.ok) issues = await response.json();
    }

    if (!Array.isArray(issues)) return;

    issues.forEach(issue => {
      const lat = issue.location?.lat;
      const lng = issue.location?.lng;

      if (lat && lng) {
        // Map color scheme indicator depending on the verification matrix results
        const isVerified = issue.locationVerification === 'verified' || issue.locationVerification === 'verified_text_only';
        const verifyLabel = issue.locationVerification === 'verified' ? '✅ VERIFIED MATCH' : issue.locationVerification === 'unverified' ? '🚨 LOCATION MISMATCH' : 'ℹ️ TEXT ONLY';
        const badgeColor = issue.locationVerification === 'verified' ? '#16a34a' : issue.locationVerification === 'unverified' ? '#dc2626' : '#d97706';

        const marker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(issueMap);
        
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
  } catch (err) {
    console.error('Failed to plot markers:', err);
  }
}

init();