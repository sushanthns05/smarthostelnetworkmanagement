const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/devices', (req, res) => {
  const devices = db.prepare('SELECT * FROM devices ORDER BY registered_at DESC').all();
  res.json(devices);
});

app.post('/api/devices/register', (req, res) => {
  const { mac_address, device_name, owner_name, room_number } = req.body;
  const mac = String(mac_address || '').trim().toUpperCase();
  const owner = String(owner_name || '').trim();

  if (!mac || !owner) {
    return res.status(400).json({ error: 'MAC address and owner name are required' });
  }

  const blocked = db.prepare('SELECT * FROM blocked_devices WHERE mac_address = ?').get(mac);
  if (blocked) {
    return res.status(403).json({ error: 'Device is blocked', reason: blocked.reason });
  }

  try {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO devices (id, mac_address, device_name, owner_name, room_number, status, last_seen)
      VALUES (?, ?, ?, ?, ?, 'approved', datetime('now'))
    `).run(
      id,
      mac,
      String(device_name || '').trim(),
      owner,
      String(room_number || '').trim()
    );
    res.json({ success: true, id });
  } catch (e) {
    res.status(409).json({ error: 'MAC address already registered' });
  }
});

app.patch('/api/devices/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE devices SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

function deleteDeviceRecord(device) {
  const deleteDevice = db.transaction((id, mac) => {
    db.prepare('DELETE FROM usage_logs WHERE device_id = ? OR mac_address = ?').run(id, mac);
    db.prepare('DELETE FROM blocked_devices WHERE mac_address = ?').run(mac);
    db.prepare('DELETE FROM devices WHERE id = ? OR mac_address = ?').run(id, mac);
  });

  deleteDevice(device.id, device.mac_address);
}

app.delete('/api/devices/:id', (req, res) => {
  const device = db.prepare('SELECT id, mac_address FROM devices WHERE id = ?').get(req.params.id);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  deleteDeviceRecord(device);
  res.json({ success: true });
});

app.delete('/api/devices/by-mac/:mac', (req, res) => {
  const mac = decodeURIComponent(req.params.mac).trim().toUpperCase();
  const device = db.prepare('SELECT id, mac_address FROM devices WHERE mac_address = ?').get(mac);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  deleteDeviceRecord(device);
  res.json({ success: true });
});

app.post('/api/delete-device', (req, res) => {
  const id = String(req.body.id || '').trim();
  const mac = String(req.body.mac_address || '').trim().toUpperCase();
  const device = id
    ? db.prepare('SELECT id, mac_address FROM devices WHERE id = ?').get(id)
    : db.prepare('SELECT id, mac_address FROM devices WHERE mac_address = ?').get(mac);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  deleteDeviceRecord(device);
  res.json({ success: true });
});

app.post('/api/block', (req, res) => {
  const mac = String(req.body.mac_address || '').trim().toUpperCase();
  const reason = String(req.body.reason || 'No reason given').trim();

  if (!mac) {
    return res.status(400).json({ error: 'MAC address is required' });
  }

  try {
    db.prepare('INSERT OR REPLACE INTO blocked_devices (mac_address, reason) VALUES (?, ?)').run(mac, reason);
    db.prepare("UPDATE devices SET status = 'blocked' WHERE mac_address = ?").run(mac);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/block/:mac', (req, res) => {
  const mac = decodeURIComponent(req.params.mac).toUpperCase();
  db.prepare('DELETE FROM blocked_devices WHERE mac_address = ?').run(mac);
  db.prepare("UPDATE devices SET status = 'approved' WHERE mac_address = ?").run(mac);
  res.json({ success: true });
});

app.get('/api/blocked', (req, res) => {
  res.json(db.prepare('SELECT * FROM blocked_devices ORDER BY blocked_at DESC').all());
});

app.post('/api/usage/log', (req, res) => {
  const { device_id, mac_address, bytes_sent, bytes_received } = req.body;
  db.prepare('INSERT INTO usage_logs (device_id, mac_address, bytes_sent, bytes_received) VALUES (?, ?, ?, ?)')
    .run(device_id, mac_address, bytes_sent || 0, bytes_received || 0);
  db.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?").run(device_id);
  res.json({ success: true });
});

app.get('/api/usage/report', (req, res) => {
  const report = db.prepare(`
    SELECT d.owner_name, d.room_number, d.mac_address, d.device_name,
      SUM(u.bytes_sent) as total_sent,
      SUM(u.bytes_received) as total_received,
      COUNT(u.id) as sessions,
      MAX(u.logged_at) as last_active
    FROM usage_logs u
    JOIN devices d ON u.device_id = d.id
    GROUP BY d.id
    ORDER BY total_received DESC
  `).all();
  res.json(report);
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
  const approved = db.prepare("SELECT COUNT(*) as c FROM devices WHERE status='approved'").get().c;
  const blocked = db.prepare('SELECT COUNT(*) as c FROM blocked_devices').get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM devices WHERE status='pending'").get().c;
  const totalData = db.prepare('SELECT SUM(bytes_received + bytes_sent) as t FROM usage_logs').get().t || 0;
  res.json({ total, approved, blocked, pending, totalData });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
