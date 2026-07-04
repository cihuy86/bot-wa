const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const { getGroupConfig, setGroupConfig } = require('./lib/database');
const { menuText } = require('./lib/functions');
const { isOwner, addOwner, removeOwner, setMode, getMode } = require('./lib/settings');
const readline = require('readline');

// === KONFIGURASI ===
const SESSION_DIR = './session';
const PAIRING_CODE = true;

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
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 10_000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,
  });

  // === PAIRING CODE DAN AUTO OWNER ===
  if (PAIRING_CODE && !sock.authState.creds.registered) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    console.log('──────────────────────────────────');
    console.log('   🔥 ARSITEK NERAKA PAIRING 🔥');
    console.log('──────────────────────────────────');
    rl.question('📱 MASUKKAN NOMOR HP (628xxxx): ', async (phoneNumber) => {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`🔐 KODE PAIRING ANDA: ${code}`);
      console.log('⏳ Masukkan kode tersebut di WhatsApp (Perangkat Tertaut > Masukkan Kode)');
      rl.close();
    });
  }

  // Set owner pertama kali setelah konek
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      // Jika owner masih kosong, tambahkan nomor bot sebagai owner pertama
      if (!isOwner(myJid)) {
        addOwner(myJid);
        console.log(`👑 Owner otomatis: ${myJid.split('@')[0]}`);
      }
      console.log('✅ Bot tersambung! Ketik .menu untuk perintah.');
    } else if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Koneksi putus, reconnect...');
      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Logout, hapus session lalu ulangi.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // === HANDLER PESAN UTAMA ===
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const type = Object.keys(msg.message)[0];
    const body =
      type === 'conversation'
        ? msg.message.conversation
        : type === 'extendedTextMessage'
        ? msg.message.extendedTextMessage.text
        : type === 'imageMessage'
        ? msg.message.imageMessage.caption
        : type === 'videoMessage'
        ? msg.message.videoMessage.caption
        : '';
    if (!body) return;

    const prefix = '.';
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const sender = msg.key.remoteJid;
    const pushname = msg.pushName || 'User';
    const isGroup = sender.endsWith('@g.us');
    const groupMetadata = isGroup ? await sock.groupMetadata(sender) : null;
    const groupAdmins = isGroup
      ? groupMetadata.participants.filter(p => p.admin).map(p => p.id)
      : [];
    const isAdmin = groupAdmins.includes(sender);
    const isBotAdmin = isGroup
      ? groupAdmins.includes(sock.user.id.split(':')[0] + '@s.whatsapp.net')
      : false;

    // === PENGECEKAN MODE SELF ===
    const currentMode = getMode();
    const senderIsOwner = isOwner(sender);
    if (currentMode === 'self' && !senderIsOwner) {
      // Abaikan selain owner jika self mode
      return;
    }

    // === HANDLER COMMAND ===
    try {
      switch (command) {
        case 'menu':
          await sock.sendMessage(sender, { text: menuText(pushname, senderIsOwner, sender) }, { quoted: msg });
          break;

        case 'ping': {
          const start = Date.now();
          const sent = await sock.sendMessage(sender, { text: '🏓 Pong!' });
          const end = Date.now();
          await sock.sendMessage(sender, { text: `⚡ Respon: ${end - start} ms`, edit: sent.key });
          break;
        }

        case 'owner':
          await sock.sendMessage(sender, {
            text: `👑 *PEMILIK BOT*\n\nNama: Arsitek Neraka\nInstagram: @arsitek_neraka\nTelegram: t.me/arsitekneraka`
          });
          break;

        case 'info':
          await sock.sendMessage(sender, {
            text: `🤖 *INFO BOT*\nNama: Arsitek Bot\nVersi: 6.6.6\nLibrary: Baileys Pairing Code\nOwner: Arsitek Neraka`
          });
          break;

        case 'runtime': {
          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600);
          const m = Math.floor((uptime % 3600) / 60);
          const s = Math.floor(uptime % 60);
          await sock.sendMessage(sender, { text: `⏱️ *RUNTIME:* ${h} jam ${m} menit ${s} detik` });
          break;
        }

        case 'sticker':
        case 'stickeranim': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sock.sendMessage(sender, { text: '⚠️ Balas gambar/video dengan perintah ini, tolol!' });
            return;
          }
          const mediaType = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
          if (!mediaType) {
            await sock.sendMessage(sender, { text: '⚠️ Media tidak didukung, jembut!' });
            return;
          }
          const stream = await downloadContentFromMessage(
            quoted[mediaType + 'Message'],
            mediaType
          );
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }
          await sock.sendMessage(sender, { sticker: buffer, pack: 'Arsitek', author: 'Neraka' });
          break;
        }

        case 'toimg': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted || !quoted.stickerMessage) {
            await sock.sendMessage(sender, { text: '⚠️ Balas stiker!' });
            return;
          }
          const stream = await downloadContentFromMessage(quoted.stickerMessage, 'image');
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }
          await sock.sendMessage(sender, { image: buffer });
          break;
        }

        // === GROUP COMMANDS ===
        case 'hidetag':
          if (!isGroup) return await sock.sendMessage(sender, { text: 'Perintah khusus grup!' });
          if (!isAdmin) return await sock.sendMessage(sender, { text: 'Lu bukan admin, bangsat!' });
          const textHidetag = args.join(' ') || 'Hidetag by Arsitek';
          const mentions = groupMetadata.participants.map(p => p.id);
          await sock.sendMessage(sender, { text: textHidetag, mentions });
          break;

        case 'promote':
          if (!isGroup || !isAdmin || !isBotAdmin) {
            await sock.sendMessage(sender, { text: 'Gagal, cek admin/bot admin.' });
            return;
          }
          const targetPromote = msg.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetPromote) {
            await sock.sendMessage(sender, { text: 'Balas pesan member yang ingin dijadikan admin.' });
            return;
          }
          await sock.groupParticipantsUpdate(sender, [targetPromote], 'promote');
          await sock.sendMessage(sender, { text: `✅ Berhasil promote @${targetPromote.split('@')[0]}`, mentions: [targetPromote] });
          break;

        case 'demote':
          if (!isGroup || !isAdmin || !isBotAdmin) return;
          const targetDemote = msg.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetDemote) {
            await sock.sendMessage(sender, { text: 'Balas pesan admin yang ingin diturunkan.' });
            return;
          }
          await sock.groupParticipantsUpdate(sender, [targetDemote], 'demote');
          await sock.sendMessage(sender, { text: `⬇️ Demoted @${targetDemote.split('@')[0]}`, mentions: [targetDemote] });
          break;

        case 'kick':
          if (!isGroup || !isAdmin || !isBotAdmin) return;
          const targetKick = msg.message.extendedTextMessage?.contextInfo?.participant;
          if (!targetKick) {
            await sock.sendMessage(sender, { text: 'Balas pesan member yang ingin dikick.' });
            return;
          }
          await sock.groupParticipantsUpdate(sender, [targetKick], 'remove');
          await sock.sendMessage(sender, { text: `👢 Kick @${targetKick.split('@')[0]}`, mentions: [targetKick] });
          break;

        case 'add': {
          if (!isGroup || !isAdmin || !isBotAdmin) return;
          const num = args[0];
          if (!num) {
            await sock.sendMessage(sender, { text: 'Contoh: .add 628xxxx' });
            return;
          }
          const userJid = num.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          await sock.groupParticipantsUpdate(sender, [userJid], 'add');
          await sock.sendMessage(sender, { text: `➕ Berhasil menambahkan ${num}` });
          break;
        }

        case 'tagall':
          if (!isGroup || !isAdmin) return;
          const tagMsg = args.join(' ') || '📢 Tag all';
          const allMembers = groupMetadata.participants.map(p => p.id);
          await sock.sendMessage(sender, { text: tagMsg, mentions: allMembers });
          break;

        case 'antilink':
          if (!isGroup || !isAdmin) return;
          const alStatus = args[0]?.toLowerCase();
          if (alStatus === 'on' || alStatus === 'off') {
            setGroupConfig(sender, { antilink: alStatus === 'on' });
            await sock.sendMessage(sender, { text: `Antilink ${alStatus === 'on' ? 'AKTIF' : 'MATI'}` });
          } else {
            await sock.sendMessage(sender, { text: 'Gunakan .antilink on/off' });
          }
          break;

        case 'welcome':
          if (!isGroup || !isAdmin) return;
          const wStatus = args[0]?.toLowerCase();
          if (wStatus === 'on' || wStatus === 'off') {
            setGroupConfig(sender, { welcome: wStatus === 'on' });
            await sock.sendMessage(sender, { text: `Welcome ${wStatus === 'on' ? 'AKTIF' : 'MATI'}` });
          } else {
            await sock.sendMessage(sender, { text: 'Gunakan .welcome on/off' });
          }
          break;

        case 'antitoxic':
          if (!isGroup || !isAdmin) return;
          const atStatus = args[0]?.toLowerCase();
          if (atStatus === 'on' || atStatus === 'off') {
            setGroupConfig(sender, { antitoxic: atStatus === 'on' });
            await sock.sendMessage(sender, { text: `Antitoxic ${atStatus === 'on' ? 'AKTIF' : 'MATI'}` });
          } else {
            await sock.sendMessage(sender, { text: 'Gunakan .antitoxic on/off' });
          }
          break;

        case 'listbadword': {
          const badwords = getGroupConfig(sender).badwords || [];
          await sock.sendMessage(sender, { text: `Kata toxic: ${badwords.join(', ') || 'Tidak ada'}` });
          break;
        }

        case 'addbadword':
          if (!isGroup || !isAdmin) return;
          const word = args[0];
          if (!word) {
            await sock.sendMessage(sender, { text: 'Masukkan kata, contoh: .addbadword kontol' });
            return;
          }
          const conf = getGroupConfig(sender);
          conf.badwords = conf.badwords || [];
          if (!conf.badwords.includes(word)) conf.badwords.push(word);
          setGroupConfig(sender, conf);
          await sock.sendMessage(sender, { text: `Kata '${word}' ditambahkan.` });
          break;

        case 'totaluser': {
          const chats = await sock.fetchAllWhatsAppContacts();
          await sock.sendMessage(sender, { text: `Total chat: ${chats.length}` });
          break;
        }

        case 'broadcast':
          if (!senderIsOwner) return await sock.sendMessage(sender, { text: 'Hanya owner yang bisa broadcast, anjing!' });
          const bcText = args.join(' ');
          if (!bcText) {
            await sock.sendMessage(sender, { text: 'Isi pesan broadcast, jancok!' });
            return;
          }
          const allChats = await sock.fetchAllWhatsAppContacts();
          for (const chat of allChats) {
            try {
              await sock.sendMessage(chat.id, { text: bcText });
              await delay(500);
            } catch (e) {}
          }
          await sock.sendMessage(sender, { text: 'Broadcast selesai.' });
          break;

        case 'delete': {
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!quotedMsg || !quotedSender) return;
          if (quotedSender === sock.user.id.split(':')[0] + '@s.whatsapp.net') {
            await sock.sendMessage(sender, { delete: { remoteJid: sender, fromMe: true, id: quotedMsg, participant: quotedSender } });
          }
          break;
        }

        // === OWNER ONLY COMMANDS ===
        case 'self':
          if (!senderIsOwner) return await sock.sendMessage(sender, { text: 'Hanya owner, kontol!' });
          if (setMode('self')) {
            await sock.sendMessage(sender, { text: '🔒 Mode SELF diaktifkan. Bot hanya merespon owner.' });
          }
          break;

        case 'public':
          if (!senderIsOwner) return await sock.sendMessage(sender, { text: 'Hanya owner, kontol!' });
          if (setMode('public')) {
            await sock.sendMessage(sender, { text: '🌐 Mode PUBLIC diaktifkan. Bot merespon semua.' });
          }
          break;

        case 'addowner': {
          if (!senderIsOwner) return await sock.sendMessage(sender, { text: 'Hanya owner!' });
          const targetJid = args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (!args[0]) {
            await sock.sendMessage(sender, { text: 'Gunakan: .addowner 628xxxx' });
            return;
          }
          if (addOwner(targetJid)) {
            await sock.sendMessage(sender, { text: `✅ Owner @${targetJid.split('@')[0]} ditambahkan.`, mentions: [targetJid] });
          } else {
            await sock.sendMessage(sender, { text: 'Nomor sudah menjadi owner, tolol.' });
          }
          break;
        }

        case 'delowner': {
          if (!senderIsOwner) return await sock.sendMessage(sender, { text: 'Hanya owner!' });
          const targetJid = args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (!args[0]) {
            await sock.sendMessage(sender, { text: 'Gunakan: .delowner 628xxxx' });
            return;
          }
          if (removeOwner(targetJid)) {
            await sock.sendMessage(sender, { text: `❌ Owner @${targetJid.split('@')[0]} dihapus.`, mentions: [targetJid] });
          } else {
            await sock.sendMessage(sender, { text: 'Nomor tidak ditemukan di daftar owner.' });
          }
          break;
        }

        case 'listowner': {
          const settings = require('./lib/settings').readSettings();
          const list = settings.owners.map(o => `• @${o.split('@')[0]}`).join('\n') || 'Tidak ada owner.';
          await sock.sendMessage(sender, { text: `👑 *DAFTAR OWNER:*\n${list}`, mentions: settings.owners });
          break;
        }

        default:
          // Fitur anti link & antitoxic tetap jalan
          if (isGroup && body.includes('https://')) {
            const groupConf = getGroupConfig(sender);
            if (groupConf.antilink && isBotAdmin && !isAdmin) {
              await sock.sendMessage(sender, { delete: msg.key });
              await sock.sendMessage(sender, { text: `@${sender.split('@')[0]} dilarang kirim link!`, mentions: [sender] });
            }
          }
          if (isGroup) {
            const conf = getGroupConfig(sender);
            if (conf.antitoxic && conf.badwords?.length) {
              const containsBad = conf.badwords.some(b => body.toLowerCase().includes(b));
              if (containsBad && isBotAdmin) {
                await sock.sendMessage(sender, { delete: msg.key });
                await sock.sendMessage(sender, { text: `Kata toxic terdeteksi!` });
              }
            }
          }
          break;
      }
    } catch (err) {
      console.error('Error executing command:', err);
      await sock.sendMessage(sender, { text: 'Error njir, cek log!' });
    }
  });

  // Group participants update (welcome)
  sock.ev.on('group-participants.update', async (event) => {
    const { id, participants, action } = event;
    const config = getGroupConfig(id);
    if (!config.welcome) return;
    const groupName = (await sock.groupMetadata(id)).subject || '';
    for (const participant of participants) {
      const tag = `@${participant.split('@')[0]}`;
      if (action === 'add') {
        await sock.sendMessage(id, {
          text: `👋 Selamat datang ${tag} di grup ${groupName}, jangan lupa baca deskripsi!`,
          mentions: [participant]
        });
      } else if (action === 'remove') {
        await sock.sendMessage(id, {
          text: `👋 Selamat tinggal ${tag}, semoga tenang di neraka.`,
          mentions: [participant]
        });
      }
    }
  });

  return sock;
}

startBot().catch(err => console.error('Fatal error:', err));
