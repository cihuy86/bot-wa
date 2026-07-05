#!/bin/bash
clear
echo "========================================="
echo "   BOT WANGZ - INSTALASI"
echo "========================================="
echo "[*] Update & upgrade paket Termux..."
pkg update -y && pkg upgrade -y
echo "[*] Install Node.js & Git..."
pkg install nodejs git -y
echo "[*] Node.js: $(node -v)"
echo "[*] NPM: $(npm -v)"
echo "[*] Install dependensi..."
npm install
echo ""
echo "========================================="
echo "   ✅ INSTALASI SELESAI!"
echo "========================================="
echo "Jalankan: node index.js"
