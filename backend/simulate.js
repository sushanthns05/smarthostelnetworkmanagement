const db = require('./db');
const devices = db.prepare('SELECT * FROM devices').all();
devices.forEach(d => {
  db.prepare('INSERT INTO usage_logs (device_id, mac_address, bytes_sent, bytes_received) VALUES (?, ?, ?, ?)')
    .run(d.id, d.mac_address, Math.floor(Math.random() * 5e7), Math.floor(Math.random() * 2e8));
});
console.log('✅ Usage data seeded!');