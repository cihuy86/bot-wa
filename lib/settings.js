const fs = require('fs-extra');
const path = require('path');
const SETTINGS_PATH = path.join(__dirname, '../settings.json');

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeJSONSync(SETTINGS_PATH, { mode: 'public', owners: [] }, { spaces: 2 });
  }
  return fs.readJSONSync(SETTINGS_PATH);
}

function writeSettings(data) {
  fs.writeJSONSync(SETTINGS_PATH, data, { spaces: 2 });
}

function isOwner(jid) {
  const { owners } = readSettings();
  return owners.includes(jid);
}

function addOwner(jid) {
  const settings = readSettings();
  if (!settings.owners.includes(jid)) {
    settings.owners.push(jid);
    writeSettings(settings);
    return true;
  }
  return false;
}

function removeOwner(jid) {
  const settings = readSettings();
  const index = settings.owners.indexOf(jid);
  if (index > -1) {
    settings.owners.splice(index, 1);
    writeSettings(settings);
    return true;
  }
  return false;
}

function setMode(mode) {
  if (mode === 'self' || mode === 'public') {
    const settings = readSettings();
    settings.mode = mode;
    writeSettings(settings);
    return true;
  }
  return false;
}

function getMode() {
  return readSettings().mode;
}

module.exports = { isOwner, addOwner, removeOwner, setMode, getMode, readSettings };
