// scripts/patch-webview.js
const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-webview',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativecommunity',
  'webview',
  'RNCWebViewClient.java'
);

console.log('[PATCH] Cerco file:', TARGET_FILE);

if (!fs.existsSync(TARGET_FILE)) {
  console.warn('[PATCH] ❌ File non trovato. Skip.');
  process.exit(0);
}

let content = fs.readFileSync(TARGET_FILE, 'utf8');
const before = content;

// Conta occorrenze
const cancelCount = (content.match(/handler\.cancel\(\)/g) || []).length;
console.log(`[PATCH] Trovate ${cancelCount} occorrenze di handler.cancel()`);

// Sostituisci handler.cancel() con handler.proceed()
content = content.replace(
  /handler\.cancel\(\)/g,
  'handler.proceed() /* SSL BYPASS */'
);

if (content !== before) {
  fs.writeFileSync(TARGET_FILE, content);
  console.log(`[PATCH] ✅ Patch SSL applicata (${cancelCount} sostituzioni)`);
} else {
  console.warn('[PATCH] ⚠️ Nessuna sostituzione effettuata');
}