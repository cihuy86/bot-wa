const fs = require('fs-extra');
const path = require('path');

// Path database JSON (disimpan di root folder)
const DB_PATH = path.join(__dirname, '../database.json');

/**
 * Membaca seluruh database dari file JSON.
 * Jika file tidak ada, buat baru dengan struktur default.
 */
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    // Buat file default jika belum ada
    fs.writeJSONSync(DB_PATH, {
      groups: {}
    }, { spaces: 2 });
  }
  return fs.readJSONSync(DB_PATH);
}

/**
 * Menulis ulang database ke file JSON.
 * @param {object} data - Objek database yang akan ditulis
 */
function writeDB(data) {
  fs.writeJSONSync(DB_PATH, data, { spaces: 2 });
}

/**
 * Mendapatkan konfigurasi grup tertentu berdasarkan ID.
 * Jika grup belum ada, inisialisasi dengan default.
 * @param {string} groupId - ID grup (misal: 123456789@g.us)
 * @returns {object} Konfigurasi grup (antilink, welcome, antitoxic, dll)
 */
function getGroupConfig(groupId) {
  const db = readDB();
  // Jika grup belum terdaftar, beri nilai default
  if (!db.groups[groupId]) {
    db.groups[groupId] = {
      antilink: false,
      welcome: false,
      antitoxic: false,
      badwords: []
    };
    writeDB(db);
  }
  return db.groups[groupId];
}

/**
 * Mengatur / memperbarui konfigurasi grup.
 * @param {string} groupId - ID grup
 * @param {object} config - Object berisi key:value yang ingin diubah
 * @returns {object} Konfigurasi grup terbaru
 */
function setGroupConfig(groupId, config) {
  const db = readDB();
  // Gabungkan konfigurasi lama dengan yang baru
  const currentConfig = db.groups[groupId] || {
    antilink: false,
    welcome: false,
    antitoxic: false,
    badwords: []
  };
  db.groups[groupId] = { ...currentConfig, ...config };
  writeDB(db);
  return db.groups[groupId];
}

module.exports = { getGroupConfig, setGroupConfig };
