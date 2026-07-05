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
    browser: ['BOT WANGZ', 'Chrome', '6.6.6'],
    logger: pino({ level: 'silent' }),
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 5_000,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

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
        console.log(`👑 Owner: ${myJid.split('@')[0]}`);
      }
      console.log('✅ BOT WANGZ SIAP!');
    } else if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Reconnect...');
        setTimeout(startBot, 2_000);
      } else {
        console.log('❌ Logout. Hapus session & jalankan ulang.');
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
    const groupMetadata = isGroup ? await sock.groupMetadata(sender).catch(() => null) : null;
    const groupAdmins = isGroup && groupMetadata ? groupMetadata.participants.filter(p => p.admin).map(p => p.id) : [];
    const isAdmin = groupAdmins.includes(sender) || isFromMe;
    const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isBotAdmin = isGroup ? groupAdmins.includes(myJid) : false;

    const currentMode = getMode();
    const senderIsOwner = isOwner(sender) || isFromMe;

    if (currentMode === 'self' && !senderIsOwner) return;

    async function react(emoji) {
      try {
        await sock.sendMessage(sender, { react: { text: emoji, key: msg.key } });
      } catch (e) {}
    }

    // Singkatan command
    let fullCommand = command;
    if (command === 's') fullCommand = 'sticker';
    if (command === 'h') fullCommand = 'hidetag';

    try {
      switch (fullCommand) {
        case 'menu':
          await sock.sendMessage(sender, { text: menuText(pushname, senderIsOwner, sender) }, { quoted: msg });
          await react('✅');
          break;

        case 'ping': {
          const start = Date.now();
          await sock.sendMessage(sender, { text: `⚡ Respon: ${Date.now() - start} ms` });
          await react('✅');
          break;
        }

        case 'owner':
          await sock.sendMessage(sender, { text: `👑 *OWNER BOT WANGZ*\n\nInstagram: @botwangz\nTelegram: t.me/botwangz` });
          await react('✅');
          break;

        case 'info':
          await sock.sendMessage(sender, { text: `🤖 *INFO BOT WANGZ*\nNama: BOT WANGZ\nVersi: 6.6.6\nLibrary: Baileys\nMode: Anti Delay` });
          await react('✅');
          break;

        case 'runtime': {
          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600);
          const m = Math.floor((uptime % 3600) / 60);
          const s = Math.floor(uptime % 60);
          await sock.sendMessage(sender, { text: `⏱️ *RUNTIME:* ${h}j ${m}m ${s}d` });
          await react('✅');
          break;
        }

        case 'brat': {
          const text = args.join(' ');
          if (!text) {
            await react('❌');
            await sock.sendMessage(sender, { text: '📌 *Cara pakai:* `.brat [teks]`\nContoh: `.brat wangz ganteng`' });
            return;
          }
          await react('⏳');
          try {
            const response = await fetch(`https://brat.caliphdev.com/api/brat?text=${encodeURIComponent(text)}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            await sock.sendMessage(sender, { sticker: buffer, pack: 'BOT WANGZ', author: 'Brat HD' });
            await react('✅');
          } catch (e) {
            await react('❌');
            await sock.sendMessage(sender, { text: '❌ Gagal bikin stiker brat, coba lagi.' });
          }
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
          const mediaType = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : null;
          if (!mediaType) {
            await react('❌');
            await sock.sendMessage(sender, { text: help || 'Media tidak didukung!' });
            return;
          }
          await react('⏳');
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

        case 'hidetag':
          if (!isGroup) { await react('❌'); await sock.sendMessage(sender, { text: 'Grup only!' }); return; }
          if (!isAdmin && !isFromMe) { await react('❌'); return; }
          await sock.sendMessage(sender, { text: args.join(' ') || 'Hidetag', mentions: groupMetadata.participants.map(p => p.id) });
          await react('✅');
          break;

        case 'promote': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await sock.groupParticipantsUpdate(sender, [target], 'promote');
          await sock.sendMessage(sender, { text: `✅ Promote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'demote': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await sock.groupParticipantsUpdate(sender, [target], 'demote');
          await sock.sendMessage(sender, { text: `⬇️ Demote @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'kick': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); return; }
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (!target) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          await sock.groupParticipantsUpdate(sender, [target], 'remove');
          await sock.sendMessage(sender, { text: `👢 Kick @${target.split('@')[0]}`, mentions: [target] });
          await react('✅');
          break;
        }

        case 'add': {
          const help = getCommandHelp(command);
          if (!isGroup || (!isAdmin && !isFromMe) || !isBotAdmin) { await react('❌'); return; }
          if (!args[0]) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          const userJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          await sock.groupParticipantsUpdate(sender, [userJid], 'add');
          await sock.sendMessage(sender, { text: `➕ ${args[0]} ditambahkan.` });
          await react('✅');
          break;
        }

        case 'tagall':
          if (!isGroup || (!isAdmin && !isFromMe)) { await react('❌'); return; }
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
          await sock.sendMessage(sender, { text: `'${word}' ditambahkan.` });
          break;
        }

        case 'totaluser': {
          const chats = await sock.fetchAllWhatsAppContacts();
          await sock.sendMessage(sender, { text: `Total: ${chats.length} chat` });
          await react('✅');
          break;
        }

        case 'broadcast': {
          const help = getCommandHelp(command);
          if (!senderIsOwner) { await react('❌'); return; }
          const bcText = args.join(' ');
          if (!bcText) { await react('❌'); await sock.sendMessage(sender, { text: help }); return; }
          const allChats = await sock.fetchAllWhatsAppContacts();
          for (const chat of allChats) {
            try { await sock.sendMessage(chat.id, { text: bcText }); await delay(200); } catch (e) {}
          }
          await react('✅');
          break;
        }

        case 'delete': {
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
          if (!quotedMsg) return;
          try {
            await sock.sendMessage(sender, { delete: msg.key });
            await react('✅');
          } catch (e) {
            await react('❌');
          }
          break;
        }

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
          }
          break;
        }

        case 'listowner': {
          const owners = readSettings().owners;
          const list = owners.map(o => `• wa.me/${o.split('@')[0]}`).join('\n') || 'Tidak ada.';
          await react('✅');
          await sock.sendMessage(sender, { text: `👑 *OWNER:*\n${list}` });
          break;
        }

        default: {
          // Command gak dikenal? Bot diem total.
          // Cuma cek antilink di background
          if (isGroup && body.includes('https://')) {
            const conf = getGroupConfig(sender);
            if (conf.antilink && isBotAdmin && !isAdmin && !isFromMe) {
              await sock.sendMessage(sender, { delete: msg.key });
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  });

  return sock;
}

startBot().catch(err => console.error('Fatal:', err));
