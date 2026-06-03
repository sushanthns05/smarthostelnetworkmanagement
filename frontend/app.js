const API = window.API_BASE_URL || (
  window.location.port === '3001'
    ? `${window.location.origin}/api`
    : 'http://localhost:3001/api'
);

function showTab(name, button) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(navButton => navButton.classList.remove('active'));

  document.getElementById(`tab-${name}`).classList.add('active');
  if (button) button.classList.add('active');

  if (name === 'dashboard') loadStats();
  if (name === 'devices') loadDevices();
  if (name === 'blocked') loadBlocked();
  if (name === 'reports') loadReports();
}

function fmt(bytes = 0) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function dash(value) {
  return value || '-';
}

function setMessage(id, text, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.style.color = isError ? 'var(--red)' : 'var(--green)';
}

async function request(path, options) {
  const url = `${API}${path}`;
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('Cannot connect to backend. Start the server on port 3001.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}) at ${url}`);
  }

  return data;
}

async function loadStats() {
  try {
    const stats = await request('/stats');
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-approved').textContent = stats.approved;
    document.getElementById('stat-blocked').textContent = stats.blocked;
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-data').textContent = fmt(stats.totalData);
  } catch (error) {
    console.error(error);
  }
}

async function registerDevice() {
  const body = {
    mac_address: document.getElementById('reg-mac').value,
    device_name: document.getElementById('reg-name').value,
    owner_name: document.getElementById('reg-owner').value,
    room_number: document.getElementById('reg-room').value
  };

  try {
    await request('/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    setMessage('reg-msg', 'Device registered successfully');
    document.querySelectorAll('#tab-register input').forEach(input => { input.value = ''; });
    loadStats();
  } catch (error) {
    setMessage('reg-msg', error.message, true);
  }
}

async function loadDevices() {
  const devices = await request('/devices');
  const element = document.getElementById('devices-list');

  if (!devices.length) {
    element.innerHTML = '<p class="empty-state">No devices registered yet.</p>';
    return;
  }

  element.innerHTML = `<table>
    <thead><tr><th>Owner</th><th>Room</th><th>Device</th><th>MAC</th><th>Status</th><th>Last Seen</th><th>Actions</th></tr></thead>
    <tbody>${devices.map(device => {
      const statusAction = device.status === 'blocked'
        ? `<button class="action-btn" data-action="unblock" data-mac="${device.mac_address}">Unblock</button>`
        : `<button class="action-btn danger" data-action="block" data-mac="${device.mac_address}">Block</button>`;

      return `<tr>
      <td>${dash(device.owner_name)}</td>
      <td>${dash(device.room_number)}</td>
      <td>${dash(device.device_name)}</td>
      <td class="mono">${device.mac_address}</td>
      <td><span class="badge ${device.status}">${device.status}</span></td>
      <td class="muted">${device.last_seen ? device.last_seen.slice(0, 16) : '-'}</td>
      <td>
        <button class="action-btn" data-action="usage" data-id="${device.id}" data-mac="${device.mac_address}">Add Usage</button>
        ${statusAction}
        <button class="action-btn danger" data-action="delete" data-id="${device.id}" data-mac="${device.mac_address}">Delete</button>
      </td>
    </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function addUsage(deviceId, mac) {
  try {
    await request('/usage/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        mac_address: mac,
        bytes_sent: Math.floor(Math.random() * 5e7),
        bytes_received: Math.floor(Math.random() * 2e8)
      })
    });
    setMessage('devices-msg', 'Usage added');
    loadDevices();
    loadStats();
  } catch (error) {
    setMessage('devices-msg', error.message, true);
  }
}

async function blockDeviceFromTable(mac) {
  const reason = prompt('Reason for blocking?') || 'Unauthorized';
  try {
    await request('/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac_address: mac, reason })
    });
    setMessage('devices-msg', 'Device blocked');
    loadDevices();
    loadStats();
  } catch (error) {
    setMessage('devices-msg', error.message, true);
  }
}

async function deleteDevice(id, mac) {
  if (!confirm('Delete this device?')) return;
  try {
    await request('/delete-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mac_address: mac })
    });
    setMessage('devices-msg', 'Device deleted');
    loadDevices();
    loadBlocked();
    loadStats();
  } catch (error) {
    setMessage('devices-msg', error.message, true);
  }
}

async function blockDevice() {
  const mac = document.getElementById('block-mac').value;
  const reason = document.getElementById('block-reason').value;

  await request('/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac_address: mac, reason })
  });

  document.getElementById('block-mac').value = '';
  document.getElementById('block-reason').value = '';
  loadBlocked();
  loadStats();
}

async function loadBlocked() {
  const list = await request('/blocked');
  const element = document.getElementById('blocked-list');

  if (!list.length) {
    element.innerHTML = '<p class="empty-state">No blocked devices.</p>';
    return;
  }

  element.innerHTML = `<table>
    <thead><tr><th>MAC Address</th><th>Reason</th><th>Blocked At</th><th>Actions</th></tr></thead>
    <tbody>${list.map(blocked => `<tr>
      <td class="mono">${blocked.mac_address}</td>
      <td>${dash(blocked.reason)}</td>
      <td class="muted">${blocked.blocked_at.slice(0, 16)}</td>
      <td><button class="action-btn" onclick="unblock('${blocked.mac_address}')">Unblock</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function unblock(mac) {
  try {
    await request(`/block/${encodeURIComponent(mac)}`, { method: 'DELETE' });
    setMessage('devices-msg', 'Device unblocked');
    loadDevices();
    loadBlocked();
    loadStats();
  } catch (error) {
    setMessage('devices-msg', error.message, true);
  }
}

async function loadReports() {
  const data = await request('/usage/report');
  const element = document.getElementById('report-list');

  if (!data.length) {
    element.innerHTML = '<p class="empty-state">No usage data yet. Register devices and log some usage.</p>';
    return;
  }

  element.innerHTML = `<table>
    <thead><tr><th>Student</th><th>Room</th><th>Device</th><th>Sent</th><th>Received</th><th>Sessions</th><th>Last Active</th></tr></thead>
    <tbody>${data.map(row => `<tr>
      <td>${dash(row.owner_name)}</td>
      <td>${dash(row.room_number)}</td>
      <td>${dash(row.device_name)}</td>
      <td>${fmt(row.total_sent)}</td>
      <td>${fmt(row.total_received)}</td>
      <td>${row.sessions}</td>
      <td class="muted">${row.last_active ? row.last_active.slice(0, 16) : '-'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

loadStats();

document.getElementById('devices-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id, mac } = button.dataset;
  if (action === 'usage') addUsage(id, mac);
  if (action === 'block') blockDeviceFromTable(mac);
  if (action === 'unblock') unblock(mac);
  if (action === 'delete') deleteDevice(id, mac);
});
