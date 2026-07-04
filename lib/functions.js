const fs = require('fs-extra');
const path = require('path');
const { getMode, readSettings } = require('./settings');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function menuText(pushname, isOwner, senderJid) {
  const mode = getMode();
  const modeEmoji = mode === 'self' ? '🔒' : '🌐';
  const owners = readSettings().owners;
  const ownerList = owners.map(o => `@${o.split('@')[0]}`).join(', ') || 'Belum ada owner';

  return `
╔══════════════════════════╗
║  🤖 *ARSITEK NERAKA BOT*  ║
╚══════════════════════════╝
╔══════════════════════════╗
║ 👤 *User:* ${pushname}
║ ${modeEmoji} *Mode:* ${mode.toUpperCase()} 
║ 👑 *Owner:* ${ownerList}
║ 📆 *Hari:* ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
║ ⏰ *Jam:* ${new Date().toLocaleTimeString('id-ID')}
╚══════════════════════════╝
╔══════════════════════════════════════╗
║           📋 DAFTAR MENU 📋           ║
╠══════════════════════════════════════╣
║ 🧩 *GENERAL*                        ║
║  .menu        - Tampilkan menu ini  ║
║  .ping        - Cek kecepatan bot   ║
║  .owner       - Info pemilik        ║
║  .info        - Info bot            ║
║  .runtime     - Lama bot berjalan   ║
║                                     ║
║ 🎨 *MEDIA*                          ║
║  .sticker     - Buat stiker (gambar)║
║  .stickeranim - Stiker dari video   ║
║  .toimg       - Stiker ke gambar    ║
║                                     ║
║ 👥 *GROUP (khusus admin)*           ║
║  .hidetag     - Tag semua tersembunyi║
║  .promote     - Jadikan admin       ║
║  .demote      - Turunkan admin      ║
║  .kick        - Keluarkan member    ║
║  .add         - Tambah member       ║
║  .tagall      - Tag semua           ║
║                                     ║
║ 🛡️ *GROUP SECURITY*                ║
║  .antilink on/off - Anti link grup  ║
║  .welcome on/off  - Pesan welcome   ║
║  .antitoxic on/off - Filter kata    ║
║  .listbadword    - List kata toxic   ║
║  .addbadword     - Tambah kata      ║
║                                     ║
║ 👑 *OWNER ONLY*                     ║
║  .self        - Ubah ke self mode   ║
║  .public      - Ubah ke public mode ║
║  .addowner    - Tambah owner        ║
║  .delowner    - Hapus owner         ║
║  .listowner   - Lihat daftar owner  ║
║                                     ║
║ 📊 *OTHER*                          ║
║  .totaluser  - Total chat user      ║
║  .broadcast  - Broadcast ke semua   ║
║  .delete     - Hapus pesan bot      ║
╚══════════════════════════════════════╝
║ 💀 *ARSITEK KODE NERAKA* 💀
╚══════════════════════════════════════╝
`;
}

module.exports = { delay, menuText };
