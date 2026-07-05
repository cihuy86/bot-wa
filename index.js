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
const { getGroupConfig, setGroupConfig } = require('./lib/database');
const { menuText, getCommandHelp } = require('./lib/functions');
const { isOwner, addOwner, removeOwner, setMode, getMode, readSettings } = require('./lib/settings');
const readline = require('readline');

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

  // Pairing & auto owner
  if (PAIRING_CODE && !sock.authState.creds.registered) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('─────────────────────────────');
    console.log('   🤖 BOT WANGZ PAIRING 🤖');
    console.log('─────────────────────────────');
    rl.question('📱 MASUKKAN NOMOR HP (628xxx): ', async (phoneNumber) => {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`🔐 KODE PAIRING: ${code}`);
      console.log('⏳ Masukkan kode di WhatsApp > Perangkat Tertaut > Masukkan Kode');
      rl.close();
    });
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      if (!isOwner(myJid)) {
        addOwner(myJid);
        console.log(`👑 Owner otomatis: ${myJid.split('@')[0]}`);
      }
      console.log('✅ BOT WANGZ TERSAMBUNG!');
      console.log('💬 Bot bisa respon chat sendiri & dari orang lain.');
    } else if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Koneksi putus, reconnect...');
      if (shouldReconnect) setTimeout(startBot, 3000);
      else console.log('❌ Logout. Hapus folder session lalu ulangi.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Pesan masuk
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    
    // 🔥 HAPUS BARIS INI: if (msg.key.fromMe) return;
    // Sekarang bot akan memproses pesan dari diri sendiri juga!

    const type = Object.keys(msg.message)[0];
    const body =
      type === 'conversation' ? msg.message.conversation :
      type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
      type === 'imageMessage' ? msg.message.imageMessage.caption :
      type === 'videoMessage' ? msg.message.videoMessage.caption : '';
    if (!body) return;

    const prefix = '.';
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const sender = msg.key.remoteJid;
    const isFromMe = msg.key.fromMe || false;
    const pushname = msg.pushName || (isFromMe ? 'Owner' : 'User');
    const isGroup = sender.endsWith('@g.us');
    const groupMetadata = isGroup ? await sock.groupMetadata(sender) : null;
    const groupAdmins = isGroup ? groupMetadata.participants.filter(p => p.admin).map(p => p.id) : [];
    const isAdmin = groupAdmins.includes(sender) || isFromMe;
    const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isBotAdmin = isGroup ? groupAdmins.includes(myJid) : false;

    const currentMode = getMode();
    const senderIsOwner = isOwner(sender) || isFromMe; // Chat sendiri = owner otomatis

    // Mode self: abaikan selain owner
    if (currentMode === 'self' && !senderIsOwner) return;

    async function react(emoji) {
      try {
        await sock.sendMessage(sender, { react: { text: emoji, key: msg.key } });
      } catch (e) {}
    }

    try {
      switch (command) {
        case 'menu':
          await react('⏳');
          await sock.sendMessage(sender, { text: menuText(pushname, senderIsOwner, sender) }, { quoted: msg });
          await react('✅');
          break;

        case 'ping': {
          await react('⏳');
          const start = Date.now();
          await sock.sendMessage(sender, { text: '🏓 Pong!' });
          const end = Date.now();
          await sock.sendMessage(sender, { text: `⚡ Respon: ${end - start} ms`, edit: msg.key });
          await react('✅');
          break;
        }

        case 'owner':
          await react('⏳');
          await sock.sendMessage(sender, { text: `👑 *OWNER BOT WANGZ*\n\nInstagram: @botwangz\nTelegram: t.me/botwangz` });
          await react('✅');
          break;

        case 'info':
          await react('⏳');
          await sock.sendMessage(sender, { text: `🤖 *INFO BOT WANGZ*\nNama: BOT WANGZ\nVersi: 6.6.6\nLibrary: Baileys Pairing Code\nOwner: BOT WANGZ Official` });
          await react('✅');
          break;

        case 'runtime': {
          await react('⏳');
          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600);
          const m = Math.floor((uptime % 3600) / 60);
          const s = Math.floor(uptime % 60);
          await sock.sendMessage(sender, { text: `⏱️ *RUNTIME:* ${h} jam ${m} menit ${s} detik` });
          await react('✅');
          break;
        }

        case 'sticker':
        case 'stickeranim': {
          const help = getCommandHelp(command);
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await react('❌');
            await sock.sendMessage(sender, { text: help || 'Balas gambar/video!' });
            return;
          }
          await react('⏳');
          const mediaType = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
          if (!mediaType) {
            await react('❌');
            await sock.sendMessage(sender, { text: help || 'Media tidak didukung!' });
            return;
          }
          const stream = await downloadContentFromMessage(quoted[mediaType + 'Message'], mediaType);
          let buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          await sock.sendMessage(sender, { sticker: buffer, pack: 'BOT WANGZ', author: 'Wangz' });
          await react('✅');
          break;
        }

        case 'toimg': {
          const help = getCommandHelp(command);
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted || !quoted.stickerMessage) {
            await react('❌');
            await sock.sendMessage(sender, { text: help || 'Balas stiker!' });
            return;
          }
          await react('⏳');
          const stream = await downloadContentFromMessage(quoted.stickerMessage, 'image');
          let buffer = Buffer.from([]);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          await sock.sendMessage(sender, { image: buffer });
          await react('✅');
          break;
        }

        // GROUP COMMANDS
        case 'hidetag':
          if (!isGroup) { await react('❌'); await sock.sendMessage(sender, { text: 'Perintah khusus grup!' }); return; }
          if (!isAdmin && !isFromMe) { await react('❌'); await sock.sendMessage(sender, { text: 'Lu bukan admin!' }); return; }
          await react('⏳');
          await sock.sendMessage(sender, { text: args.join(' ') || 'Hidetag by BOT WANGZ', mentions: groupMetadata.participants.map(p => p.id) });
          await react('✅');
          break;

        case 'promote': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); await sock.sendMessage(sender, { text: 'Gagal, cek admin/bot admin.' }); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await react('⏳');
          await sock.groupParticipantsUpdate(sender, [target], 'promote');
          await sock.sendMessage(sender, { text: `✅ Promote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'demote': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); await sock.sendMessage(sender, { text: 'Gagal, cek admin/bot admin.' }); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await react('⏳');
          await sock.groupParticipantsUpdate(sender, [target], 'demote');
          await sock.sendMessage(sender, { text: `⬇️ Demote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'kick': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); await sock.sendMessage(sender, { text: 'Gagal, cek admin/bot admin.' }); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await react('⏳');
          await sock.groupParticipantsUpdate(sender, [target], 'remove');
          await sock.sendMessage(sender, { text: `👢 Kick @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'add': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); return; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await react('⏳');
          const userJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          await sock.groupParticipantsUpdate(sender, [userJid], 'add');
          await sock.sendMessage(sender, { text: `➕ Berhasil menambahkan ${args[0]}` });
          await react('✅');
          break;
        }

        case 'tagall':
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
          await react('⏳');
          await sock.sendMessage(sender, { text: args.join(' ') || '📢 Tag all', mentions: groupMetadata.participants.map(p => p.id) });
          await react('✅');
          break;

        case 'antilink': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
          const status = args[0]?.toLowerCase();
          if (status !== 'on' && status !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          setGroupConfig(sender, { antilink: status === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Antilink ${status === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'welcome': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
          const status = args[0]?.toLowerCase();
          if (status !== 'on' && status !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          setGroupConfig(sender, { welcome: status === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Welcome ${status === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'antitoxic': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
          const status = args[0]?.toLowerCase();
          if (status !== 'on' && status !== 'off') { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          setGroupConfig(sender, { antitoxic: status === 'on' });
          await react('✅');
          await sock.sendMessage(sender, { text: `Antitoxic ${status === 'on' ? 'AKTIF' : 'MATI'}` });
          break;
        }

        case 'listbadword': {
          const badwords = getGroupConfig(sender).badwords || [];
          await react('✅');
          await sock.sendMessage(sender, { text: `Kata toxic: ${badwords.join(', ') || 'Tidak ada'}` });
          break;
        }

        case 'addbadword': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
          const word = args[0];
          if (!word) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          const conf = getGroupConfig(sender);
          conf.badwords = conf.badwords || [];
          if (!conf.badwords.includes(word)) conf.badwords.push(word);
          setGroupConfig(sender, conf);
          await react('✅');
          await sock.sendMessage(sender, { text: `Kata '${word}' ditambahkan.` });
          break;
        }

        case 'totaluser': {
          await react('⏳');
          const chats = await sock.fetchAllWhatsAppContacts();
          await sock.sendMessage(sender, { text: `Total chat: ${chats.length}` });
          await react('✅');
          break;
        }

        case 'broadcast': {
          const help = getCommandHelp(command);
          if (!senderIsOwner) { await react('❌'); await sock.sendMessage(sender, { text: 'Hanya owner!' }); return; }
          const bcText = args.join(' ');
          if (!bcText) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await react('⏳');
          const allChats = await sock.fetchAllWhatsAppContacts();
          for (const chat of allChats) {
            try { await sock.sendMessage(chat.id, { text: bcText }); await delay(500); } catch (e) {}
          }
          await react('✅');
          break;
        }

        case 'delete': {
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant || sender;
          if (!quotedMsg) return;
          try {
            await sock.sendMessage(sender, { delete: { remoteJid: sender, fromMe: isFromMe || (quotedSender === myJid), id: quotedMsg, participant: quotedSender } });
            await react('✅');
          } catch (e) {
            await react('❌');
          }
          break;
        }

        // OWNER ONLY
        case 'self':
          if (!senderIsOwner) { await react('❌'); return; }
          setMode('self');
          await react('🔒');
          await sock.sendMessage(sender, { text: '🔒 Mode SELF aktif.' });
          break;

        case 'public':
          if (!senderIsOwner) { await react('❌'); return; }
          setMode('public');
          await react('🌐');
          await sock.sendMessage(sender, { text: '🌐 Mode PUBLIC aktif.' });
          break;

        case 'addowner': {
          const help = getCommandHelp(command);
          if (!senderIsOwner) { await react('❌'); return; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          const targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (addOwner(targetJid)) {
            await react('✅');
            await sock.sendMessage(sender, { text: `✅ Owner @${targetJid.split('@')[0]} ditambahkan.`, mentions: [targetJid] });
          } else {
            await react('⚠️');
            await sock.sendMessage(sender, { text: 'Sudah menjadi owner.' });
          }
          break;
        }

        case 'delowner': {
          const help = getCommandHelp(command);
          if (!senderIsOwner) { await react('❌'); return; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          const targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (removeOwner(targetJid)) {
            await react('✅');
            await sock.sendMessage(sender, { text: `❌ Owner @${targetJid.split('@')[0]} dihapus.`, mentions: [targetJid] });
          } else {
            await react('⚠️');
            await sock.sendMessage(sender, { text: 'Tidak ditemukan.' });
          }
          break;
        }

        case 'listowner': {
          const owners = readSettings().owners;
          const list = owners.map(o => `• wa.me/${o.split('@')[0]}`).join('\n') || 'Tidak ada.';
          await react('✅');
          await sock.sendMessage(sender, { text: `👑 *DAFTAR OWNER:*\n${list}` });
          break;
        }

        default: {
          const help = getCommandHelp(command);
          if (help) {
            await react('❌');
            await sock.sendMessage(sender, { text: help });
            break;
          }

          await react('❌');

          if (isGroup && body.includes('https://')) {
            const conf = getGroupConfig(sender);
            if (conf.antilink && isBotAdmin && !isAdmin && !isFromMe) {
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
      }
    } catch (err) {
      console.error('Error:', err);
      await react('❌');
    }
  });

  // Welcome/Goodbye
  sock.ev.on('group-participants.update', async (event) => {
    const { id, participants, action } = event;
    const config = getGroupConfig(id);
    if (!config.welcome) return;
    const groupName = (await sock.groupMetadata(id)).subject || '';
    for (const participant of participants) {
      const tag = `@${participant.split('@')[0]}`;
      if (action === 'add') {
        await sock.sendMessage(id, { text: `👋 Selamat datang ${tag} di grup ${groupName}`, mentions: [participant] });
      } else if (action === 'remove') {
        await sock.sendMessage(id, { text: `👋 Selamat tinggal ${tag}`, mentions: [participant] });
      }
    }
  });

  return sock;
}

startBot().catch(err => console.error('Fatal error:', err));
