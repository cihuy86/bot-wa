#!/bin/bash
clear
echo "========================================="
echo "   BOT WANGZ - INSTALASI"
echo "========================================="
echo "[*] Update & upgrade paket Termux..."
pkg update -y && pkg upgrade -y
echo "[*] Install Node.js & Git..."
pkg install nodejs git -y
echo "[*] Node.js version: $(node -v)"
echo "[*] NPM version: $(npm -v)"
echo "[*] Install dependensi NPM..."
npm install
echo ""
echo "========================================="
echo "   ✅ INSTALASI SELESAI!"
echo "========================================="
echo "Jalankan bot: node index.js"
echo "Masukkan nomor HP, lalu kode pairing."
