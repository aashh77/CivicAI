/**
 * Shared lightweight API client. Loaded by all three portals (admin/user/authority).
 * Plain JS, no build step - works directly via <script src="/shared/js/api.js">.
 */
const API_BASE = ''; // same-origin: backend serves the frontends, so relative paths work

const Api = {
  token() {
    return localStorage.getItem('civic_token');
  },
  setToken(token) {
    localStorage.setItem('civic_token', token);
  },
  clearToken() {
    localStorage.removeItem('civic_token');
    localStorage.removeItem('civic_user');
  },
  setUser(user) {
    localStorage.setItem('civic_user', JSON.stringify(user));
  },
  getUser() {
    const raw = localStorage.getItem('civic_user');
    return raw ? JSON.parse(raw) : null;
  },

  async request(method, url, { body, isForm } = {}) {
    const headers = {};
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm && body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }

    if (!res.ok) {
  console.error(`Backend Error Payload [${res.status}]:`, data); // 👈 ADD THIS FOR DEBUGGING
  throw new Error(data.error || data.message || `Request failed (${res.status})`);
}
    return data;
  },

  get(url) {
    return this.request('GET', url);
  },
  post(url, body) {
    return this.request('POST', url, { body });
  },
  postForm(url, formData) {
    return this.request('POST', url, { body: formData, isForm: true });
  },
  put(url, body) {
    return this.request('PUT', url, { body });
  },
  patch(url, body) {
    return this.request('PATCH', url, { body });
  },
  delete(url) {
    return this.request('DELETE', url);
  },
};

function requireRole(allowedRoles, loginPage = '/user/login.html') {
  const user = Api.getUser();
  const token = Api.token();
  if (!token || !user || !allowedRoles.includes(user.role)) {
    window.location.href = loginPage;
    return null;
  }
  return user;
}

function logout(loginPage = '/user/login.html') {
  Api.clearToken();
  window.location.href = loginPage;
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusBadgeClass(status) {
  return {
    reported: 'badge-gray',
    assigned: 'badge-blue',
    in_progress: 'badge-orange',
    resolved: 'badge-green',
    rejected: 'badge-red',
  }[status] || 'badge-gray';
}

/**
 * Determines if a ticket has breached its SLA window
 * @param {Object} issue - The issue document from Firestore
 * @returns {boolean}
 */
function isTicketBreached(issue) {
  // If it's already resolved, the race is over
  if (issue.status === 'RESOLVED') return false;
  
  // If the background worker already flagged it
  if (issue.escalationLevel > 0) return true;
  
  // Dynamic fallback: past deadline right now, even if the worker hasn't swept yet
  if (issue.slaDeadline) {
    return new Date(issue.slaDeadline) < new Date();
  }
  
  return false;
}
