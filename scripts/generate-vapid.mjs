#!/usr/bin/env node
// Genera un par de claves VAPID para web push y las imprime listas
// para pegar en las variables de entorno.
//
// Uso: npm run vapid
//      o:  node scripts/generate-vapid.mjs

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("");
console.log("✅ Claves VAPID generadas");
console.log("");
console.log("Pegá estas líneas en .env.local (dev) o en las variables");
console.log("de entorno de Vercel (prod):");
console.log("");
console.log("─".repeat(70));
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:soporte@TU-DOMINIO.com`);
console.log("─".repeat(70));
console.log("");
console.log("Importante: cambiá el mailto: a un email tuyo real. Los servidores");
console.log("de push (Google, Mozilla, Apple) lo usan para contactarte si tu app");
console.log("genera abuso (spam de notificaciones).");
console.log("");
