const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  delay,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const http = require('http');
const { getGroupConfig, setGroupConfig } = require('./lib/database');
const { menuText, getCommandHelp } = require('./lib/functions');
const { isOwner, addOwner, removeOwner, setMode, getMode, readSettings } = require('./lib/settings');
const readline = require('readline');

const SESSION_DIR = './session';
const PAIRING_CODE = true;

// ==================== FUNGSI FETCH JSON (ANTI CRASH) ====================
function fetchJson(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const getModule = url.startsWith('https') ? https.get : http.get;
    const req = getModule(url, { timeout }, (res) => {
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        req.destroy();
        reject(new Error('Respons bukan JSON, mungkin API sedang down'));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Gagal parse JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ==================== FUNGSI DOWNLOAD BUFFER ====================
function downloadMediaBuffer(url) {
  return new Promise((resolve, reject) => {
    const getModule = url.startsWith('https') ? https.get : http.get;
    getModule(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadMediaBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ==================== START BOT ====================
async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    logger: pino({ level: 'silent' }),
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 5_000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  // ==================== PAIRING CODE ====================
  if (PAIRING_CODE && !sock.authState.creds.registered) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('─────────────────────────────');
    console.log('   🤖 BOT WANGZ PAIRING 🤖');
    console.log('─────────────────────────────');
    rl.question('📱 MASUKKAN NOMOR HP (628xxx): ', async (phoneNumber) => {
      try {
        const cleanNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
        if (!cleanNumber || cleanNumber.length < 10) {
          console.log('❌ Nomor tidak valid!');
          rl.close();
          process.exit(1);
        }
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(`🔐 KODE PAIRING: ${code}`);
        console.log('⏳ Masukkan kode di WhatsApp > Perangkat Tertaut > Masukkan Kode');
      } catch (err) {
        console.error('❌ Gagal request kode:', err.message);
      } finally {
        rl.close();
      }
    });
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      if (!isOwner(myJid)) {
        addOwner(myJid);
        console.log(`👑 Owner: ${myJid.split('@')[0]}`);
      }
      console.log('✅ BOT WANGZ SIAP!');
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconnect...');
        if (code === 428) fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        setTimeout(startBot, 2000);
      } else {
        console.log('❌ Logout. Hapus session & ulangi.');
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const type = Object.keys(msg.message)[0];
    const body =
      type === 'conversation' ? msg.message.conversation :
      type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
      type === 'imageMessage' ? (msg.message.imageMessage?.caption || '') :
      type === 'videoMessage' ? (msg.message.videoMessage?.caption || '') : '';
    if (!body) return;

    const prefix = '.';
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const sender = msg.key.remoteJid;
    const isFromMe = msg.key.fromMe || false;
    const pushname = msg.pushName || (isFromMe ? 'Owner' : 'User');
    const isGroup = sender.endsWith('@g.us');
    const groupMetadata = isGroup ? await sock.groupMetadata(sender).catch(() => null) : null;
    const groupAdmins = isGroup && groupMetadata ? groupMetadata.participants.filter(p => p.admin).map(p => p.id) : [];
    const isAdmin = groupAdmins.includes(sender) || isFromMe;
    const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isBotAdmin = isGroup ? groupAdmins.includes(myJid) : false;

    const currentMode = getMode();
    const senderIsOwner = isOwner(sender) || isFromMe;
    if (currentMode === 'self' && !senderIsOwner) return;

    async function react(emoji) {
      try { await sock.sendMessage(sender, { react: { text: emoji, key: msg.key } }); } catch (e) {}
    }

    try {
      switch (command) {

        case 'menu':
          await sock.sendMessage(sender, { text: menuText(pushname, senderIsOwner, sender) }, { quoted: msg });
          await react('✅');
          break;

        case 'ping': {
          const start = Date.now();
          await sock.sendMessage(sender, { text: `⚡ ${Date.now() - start} ms` });
          await react('✅');
          break;
        }

        case 'owner':
          await sock.sendMessage(sender, { text: `👑 *OWNER BOT WANGZ*\n\nInstagram: @botwangz\nTelegram: t.me/botwangz` });
          await react('✅');
          break;

        case 'info':
          await sock.sendMessage(sender, { text: `🤖 *INFO BOT WANGZ*\nNama: BOT WANGZ\nVersi: 6.6.6\nLibrary: Baileys` });
          await react('✅');
          break;

        case 'runtime': {
          const u = process.uptime();
          const h = Math.floor(u / 3600), m = Math.floor((u % 3600) / 60), s = Math.floor(u % 60);
          await sock.sendMessage(sender, { text: `⏱️ ${h}j ${m}m ${s}d` });
          await react('✅');
          break;
        }

        // ==================== YOUTUBE ====================
        case 'ytmp3': {
          const url = args[0];
          if (!url) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('ytmp3') }); break; }
          await react('⏳');
          try {
            const api = `https://api.akuari.my.id/downloader/ytmp3?url=${encodeURIComponent(url)}`;
            const json = await fetchJson(api);
            if (json.status && json.result?.url) {
              const buf = await downloadMediaBuffer(json.result.url);
              await sock.sendMessage(sender, { audio: buf, mimetype: 'audio/mpeg', fileName: (json.result.title||'audio')+'.mp3' });
              await react('✅');
            } else throw new Error('Missing URL');
          } catch (e) { await react('❌'); await sock.sendMessage(sender, { text: '❌ Gagal download MP3. Cek URL atau API down.' }); }
          break;
        }

        case 'ytmp4': {
          const url = args[0];
          if (!url) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('ytmp4') }); break; }
          await react('⏳');
          try {
            const api = `https://api.akuari.my.id/downloader/ytmp4?url=${encodeURIComponent(url)}`;
            const json = await fetchJson(api);
            if (json.status && json.result?.url) {
              const buf = await downloadMediaBuffer(json.result.url);
              await sock.sendMessage(sender, { video: buf, mimetype: 'video/mp4', fileName: (json.result.title||'video')+'.mp4' });
              await react('✅');
            } else throw new Error('Missing URL');
          } catch (e) { await react('❌'); await sock.sendMessage(sender, { text: '❌ Gagal download MP4.' }); }
          break;
        }

        case 'ytsearch': {
          const query = args.join(' ');
          if (!query) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('ytsearch') }); break; }
          await react('⏳');
          try {
            const api = `https://api.akuari.my.id/search/yt?query=${encodeURIComponent(query)}`;
            const json = await fetchJson(api);
            if (json.status && json.result?.length) {
              let txt = `🔍 *Hasil:* ${query}\n\n`;
              json.result.slice(0,5).forEach((v,i) => txt += `${i+1}. *${v.title}*\n   ⏱️ ${v.duration} | 👁️ ${v.views}\n   🔗 ${v.url}\n\n`);
              await sock.sendMessage(sender, { text: txt });
              await react('✅');
            } else throw new Error('Kosong');
          } catch (e) { await react('❌'); await sock.sendMessage(sender, { text: '❌ Gagal mencari.' }); }
          break;
        }

        // ==================== STIKER (BARU, BISA TANPA REPLY + WATERMARK FIQ) ====================
        case 'sticker':
        case 'stickeranim': {
          await react('⏳');

          // Tentukan sumber media: dari reply atau dari pesan langsung (gambar/video dengan caption .sticker)
          let mediaMessage = null;
          let mediaType = null;

          // Prioritas 1: reply mengandung gambar/video
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (quoted) {
            if (quoted.imageMessage) { mediaMessage = quoted.imageMessage; mediaType = 'image'; }
            else if (quoted.videoMessage) { mediaMessage = quoted.videoMessage; mediaType = 'video'; }
          }

          // Prioritas 2: pesan itu sendiri adalah gambar/video dengan caption .sticker (atau .stickeranim)
          if (!mediaMessage && (type === 'imageMessage' || type === 'videoMessage')) {
            mediaMessage = msg.message[type];
            mediaType = type === 'imageMessage' ? 'image' : 'video';
          }

          if (!mediaMessage || !mediaType) {
            await react('❌');
            await sock.sendMessage(sender, { text: '📌 Balas gambar/video, atau kirim gambar/video dengan caption `.sticker`.' });
            break;
          }

          try {
            // Unduh buffer dari media WhatsApp
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (!buffer || buffer.length < 512) throw new Error('Buffer kosong');

            // Kirim stiker dengan watermark "Fiq"
            await sock.sendMessage(sender, {
              sticker: buffer,
              pack: 'Fiq',
              author: 'Fiq'
            });
            await react('✅');
          } catch (localErr) {
            console.error('Stiker lokal gagal:', localErr.message);
            // Fallback ke API (tanpa watermark)
            try {
              const mediaUrl = mediaMessage.url || mediaMessage.fileLength ? null : null;
              // fallback hanya jika ada url (biasanya imageMessage/videoMessage punya url)
              if (!mediaUrl) throw new Error('Tidak ada URL');
              const apiSticker = `https://api.zahwazein.xyz/creator/sticker?url=${encodeURIComponent(mediaUrl)}&apikey=free`;
              const json = await fetchJson(apiSticker);
              if (json.status && json.result?.url) {
                const buf = await downloadMediaBuffer(json.result.url);
                await sock.sendMessage(sender, { sticker: buf, pack: 'Fiq', author: 'Fiq' });
                await react('✅');
              } else throw new Error('API gagal');
            } catch (fallbackErr) {
              await react('❌');
              await sock.sendMessage(sender, { text: '❌ Gagal membuat stiker.' });
            }
          }
          break;
        }

        case 'toimg': {
          const help = getCommandHelp(command);
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted?.stickerMessage) { await react('❌'); await sock.sendMessage(sender, { text: help || 'Balas stiker!' }); break; }
          await react('⏳');
          const stream = await downloadContentFromMessage(quoted.stickerMessage, 'image');
          let buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          await sock.sendMessage(sender, { image: buffer });
          await react('✅');
          break;
        }

        // ==================== GROUP ====================
        case 'hidetag':
          if (!isGroup) { await react('❌'); await sock.sendMessage(sender, { text: 'Grup only!' }); break; }
          if (!isAdmin && !isFromMe) { await react('❌'); break; }
          await sock.sendMessage(sender, { text: args.join(' ') || 'Hidetag', mentions: groupMetadata.participants.map(p => p.id) });
          await react('✅');
          break;

        case 'promote': {
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); break; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('promote') }); break; }
          await sock.groupParticipantsUpdate(sender, [target], 'promote');
          await sock.sendMessage(sender, { text: `✅ Promote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'demote': {
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); break; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('demote') }); break; }
          await sock.groupParticipantsUpdate(sender, [target], 'demote');
          await sock.sendMessage(sender, { text: `⬇️ Demote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'kick': {
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); break; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('kick') }); break; }
          await sock.groupParticipantsUpdate(sender, [target], 'remove');
          await sock.sendMessage(sender, { text: `👢 Kick @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'add': {
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); break; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('add') }); break; }
          const jid = args[0].replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          await sock.groupParticipantsUpdate(sender, [jid], 'add');
          await sock.sendMessage(sender, { text: `➕ ${args[0]} ditambahkan.` });
          await react('✅');
          break;
        }

        case 'tagall':
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); break; }
          await sock.sendMessage(sender, { text: args.join(' ') || '📢 Tag all', mentions: groupMetadata.participants.map(p => p.id) });
          await react('✅');
          break;

        // ==================== SECURITY ====================
        case 'antilink': {
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); break; }
          const st = args[0]?.toLowerCase();
          if (st !== 'on' && st !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('antilink') }); break; }
          setGroupConfig(sender, { antilink: st === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Antilink ${st === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'welcome': {
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); break; }
          const st = args[0]?.toLowerCase();
          if (st !== 'on' && st !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('welcome') }); break; }
          setGroupConfig(sender, { welcome: st === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Welcome ${st === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'antitoxic': {
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); break; }
          const st = args[0]?.toLowerCase();
          if (st !== 'on' && st !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('antitoxic') }); break; }
          setGroupConfig(sender, { antitoxic: st === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Antitoxic ${st === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'listbadword': {
          const bw = getGroupConfig(sender).badwords || [];
          await react('✅');
          await sock.sendMessage(sender, { text: `Kata toxic: ${bw.join(', ') || 'Tidak ada'}` });
          break;
        }

        case 'addbadword': {
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); break; }
          const w = args[0];
          if (!w) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('addbadword') }); break; }
          const cfg = getGroupConfig(sender);
          cfg.badwords = cfg.badwords || [];
          if (!cfg.badwords.includes(w)) cfg.badwords.push(w);
          setGroupConfig(sender, cfg);
          await react('✅');
          await sock.sendMessage(sender, { text: `'${w}' ditambahkan.` });
          break;
        }

        // ==================== OWNER & LAINNYA ====================
        case 'totaluser': {
          const chats = await sock.fetchAllWhatsAppContacts();
          await sock.sendMessage(sender, { text: `Total chat: ${chats.length}` });
          await react('✅');
          break;
        }

        case 'broadcast': {
          if (!senderIsOwner) { await react('❌'); break; }
          const txt = args.join(' ');
          if (!txt) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('broadcast') }); break; }
          const all = await sock.fetchAllWhatsAppContacts();
          for (const c of all) { try { await sock.sendMessage(c.id, { text: txt }); await delay(200); } catch (e) {} }
          await react('✅');
          break;
        }

        case 'delete': {
          const qm = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          if (!qm) break;
          try { await sock.sendMessage(sender, { delete: msg.key }); await react('✅'); } catch (e) { await react('❌'); }
          break;
        }

        case 'self':
          if (!senderIsOwner) { await react('❌'); break; }
          setMode('self');
          await react('🔒');
          await sock.sendMessage(sender, { text: '🔒 Mode SELF aktif.' });
          break;

        case 'public':
          if (!senderIsOwner) { await react('❌'); break; }
          setMode('public');
          await react('🌐');
          await sock.sendMessage(sender, { text: '🌐 Mode PUBLIC aktif.' });
          break;

        case 'addowner': {
          if (!senderIsOwner) { await react('❌'); break; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('addowner') }); break; }
          const tj = args[0].replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          if (addOwner(tj)) {
            await react('✅');
            await sock.sendMessage(sender, { text: `✅ Owner @${tj.split('@')[0]} ditambahkan.`, mentions: [tj] });
          } else await react('⚠️');
          break;
        }

        case 'delowner': {
          if (!senderIsOwner) { await react('❌'); break; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: getCommandHelp('delowner') }); break; }
          const tj = args[0].replace(/[^0-9]/g,'') + '@s.whatsapp.net';
          if (removeOwner(tj)) {
            await react('✅');
            await sock.sendMessage(sender, { text: `❌ Owner @${tj.split('@')[0]} dihapus.`, mentions: [tj] });
          } else await react('⚠️');
          break;
        }

        case 'listowner': {
          const owners = readSettings().owners;
          const list = owners.map(o => `• wa.me/${o.split('@')[0]}`).join('\n') || 'Tidak ada.';
          await react('✅');
          await sock.sendMessage(sender, { text: `👑 *OWNER:*\n${list}` });
          break;
        }

        default:
          if (isGroup && body.includes('https://')) {
            const conf = getGroupConfig(sender);
            if (conf.antilink && isBotAdmin && !isAdmin && !isFromMe) {
              await sock.sendMessage(sender, { delete: msg.key });
            }
          }
          break;
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  });

  return sock;
}

startBot().catch(err => console.error('Fatal:', err));
