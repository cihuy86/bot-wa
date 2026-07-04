const fs = require('fs-extra');
const path = require('path');
const DB_PATH = path.join(__dirname, '../database.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeJSONSync(DB_PATH, { groups: {} }, { spaces: 2 });
  }
  return fs.readJSONSync(DB_PATH);
}

function writeDB(data) {
  fs.writeJSONSync(DB_PATH, data, { spaces: 2 });
}

function getGroupConfig(groupId) {
  const db = readDB();
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

function setGroupConfig(groupId, config) {
  const db = readDB();
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
