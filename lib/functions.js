const { getMode, readSettings } = require('./settings');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCommandHelp(command) {
  const help = {
    add: '📌 *Cara pakai:* `.add 628xxxx`\nContoh: `.add 628123456789`',
    kick: '📌 *Cara pakai:* Balas pesan member lalu ketik `.kick`',
    promote: '📌 *Cara pakai:* Balas pesan member lalu ketik `.promote`',
    demote: '📌 *Cara pakai:* Balas pesan admin lalu ketik `.demote`',
    hidetag: '📌 *Cara pakai:* `.hidetag [teks]`\nContoh: `.hidetag hadir semua`',
    tagall: '📌 *Cara pakai:* `.tagall [pesan]`',
    antilink: '📌 *Cara pakai:* `.antilink on` atau `.antilink off`',
    welcome: '📌 *Cara pakai:* `.welcome on` atau `.welcome off`',
    antitoxic: '📌 *Cara pakai:* `.antitoxic on` atau `.antitoxic off`',
    addbadword: '📌 *Cara pakai:* `.addbadword [kata]`\nContoh: `.addbadword anjing`',
    broadcast: '📌 *Cara pakai:* `.broadcast [pesan]`',
    addowner: '📌 *Cara pakai:* `.addowner 628xxxx`',
    delowner: '📌 *Cara pakai:* `.delowner 628xxxx`',
    sticker: '📌 *Cara pakai:* Balas gambar/video lalu ketik `.sticker`',
    stickeranim: '📌 *Cara pakai:* Balas video lalu ketik `.stickeranim`',
    toimg: '📌 *Cara pakai:* Balas stiker lalu ketik `.toimg`',
    delete: '📌 *Cara pakai:* Balas pesan bot lalu ketik `.delete`',
    brat: '📌 *Cara pakai:* `.brat [teks]`\nContoh: `.brat wangz keren`',
  };
  return help[command] || null;
}

function menuText(pushname, isOwner, senderJid) {
  const mode = getMode();
  const modeEmoji = mode === 'self' ? '🔒' : '🌐';
  const owners = readSettings().owners;
  const ownerList = owners.map(o => `wa.me/${o.split('@')[0]}`).join(', ') || 'Belum diatur';

  return `╔══════════════════════╗
║     🤖 *BOT WANGZ*      ║
╚══════════════════════╝
╔══════════════════════╗
║ 👤 *User:* ${pushname}
║ ${modeEmoji} *Mode:* ${mode.toUpperCase()}
║ 👑 *Owner:* ${ownerList}
║ 📆 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
║ ⏰ ${new Date().toLocaleTimeString('id-ID')}
╚══════════════════════╝
╔══════════════════════════════════╗
║        📋 *DAFTAR MENU*         ║
╠══════════════════════════════════╣
║ 🧩 *GENERAL*
║  .menu        Tampilkan menu
║  .ping        Cek kecepatan bot
║  .owner       Info owner
║  .info        Info bot
║  .runtime     Lama bot berjalan
║
║ 🎨 *MEDIA*
║  .sticker     Buat stiker
║  .stickeranim Stiker dari video
║  .toimg       Stiker ke gambar
║  .brat        Stiker HD dari teks
║
║ 👥 *GROUP (admin)*
║  .hidetag     Tag tersembunyi
║  .promote     Jadikan admin
║  .demote      Turunkan admin
║  .kick        Keluarkan member
║  .add         Tambah member
║  .tagall      Tag semua
║
║ 🛡️ *SECURITY*
║  .antilink    Anti link
║  .welcome     Pesan welcome
║  .antitoxic   Filter kata
║  .listbadword List kata toxic
║  .addbadword  Tambah kata
║
║ 👑 *OWNER ONLY*
║  .self        Mode self
║  .public      Mode public
║  .addowner    Tambah owner
║  .delowner    Hapus owner
║  .listowner   Daftar owner
║
║ 📊 *OTHER*
║  .totaluser   Total chat
║  .broadcast   Broadcast
║  .delete      Hapus pesan bot
╚══════════════════════════════════╝
║ 💀 *BOT WANGZ © 2026* 💀
╚══════════════════════════════════╝`;
}

module.exports = { delay, menuText, getCommandHelp };
