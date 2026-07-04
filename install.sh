#!/bin/bash

# ╔══════════════════════════════════════════╗
# ║   🔥 ARSITEK NERAKA INSTALLER 🔥       ║
# ║   Bot WA Pairing Code, Anti Delay      ║
# ╚══════════════════════════════════════════╝

clear
echo "========================================="
echo "   ARSITEK NERAKA BOT - INSTALASI"
echo "========================================="

# Update & upgrade paket Termux
echo "[*] Update & upgrade paket Termux..."
pkg update -y && pkg upgrade -y

# Install Node.js dan git (kalau belum)
echo "[*] Install Node.js & Git..."
pkg install nodejs git -y

# Verifikasi versi
echo "[*] Node.js version: $(node -v)"
echo "[*] NPM version: $(npm -v)"

# Install dependensi npm
echo "[*] Install dependensi NPM (baileys, pino, fs-extra)..."
npm install

echo ""
echo "========================================="
echo "   ✅ INSTALASI SELESAI, RAJA IBLIS!"
echo "========================================="
echo ""
echo "Untuk menjalankan bot:"
echo "   node index.js"
echo ""
echo "Masukkan nomor HP saat diminta, lalu kode pairing."
echo "Bot akan otomatis reconnect jika koneksi putus."
echo "========================================="
