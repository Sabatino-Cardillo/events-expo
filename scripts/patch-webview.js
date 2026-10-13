// scripts/patch-webview.js
const fs = require('fs');
const path = require('path');

console.log('\n========== WEBVIEW SSL PATCH ==========');

const possiblePaths = [
  'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java',
  'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManagerImpl.kt',
  'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManager.java',
];

let patched = 0;

for (const relPath of possiblePaths) {
  const filePath = path.join(__dirname, '..', relPath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Non trovato: ${path.basename(filePath)}`);
    continue;
  }

  console.log(`\n🔍 Analizzo: ${path.basename(filePath)}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Conta quante volte appare handler.cancel()
  const cancelMatches = content.match(/handler\.cancel\(\)/g);
  console.log(`   Trovate ${cancelMatches ? cancelMatches.length : 0} occorrenze di "handler.cancel()"`);

  // Sostituisci TUTTI i handler.cancel() con handler.proceed()
  content = content.replace(
    /handler\.cancel\(\)/g,
    'handler.proceed() /* SSL BYPASS ACTIVE */'
  );

  // Fallback: cerca sslErrorHandler.cancel()
  content = content.replace(
    /sslErrorHandler\.cancel\(\)/g,
    'sslErrorHandler.proceed() /* SSL BYPASS ACTIVE */'
  );

  // Fallback: cerca .cancel() generico nel contesto SSL
  content = content.replace(
    /(\w*[sS]sl\w*)\.cancel\(\)/g,
    '$1.proceed()'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`   ✅ PATCH APPLICATA a ${path.basename(filePath)}`);
    patched++;
  } else {
    console.log(`   ⚠️  Nessuna modifica (già patchato o pattern non trovato)`);
  }
}

console.log('\n========== RISULTATO ==========');
if (patched > 0) {
  console.log(`✅ ${patched} file patchati con successo`);
} else {
  console.log('❌ NESSUN FILE PATCHATO');
}
console.log('================================\n');