// plugins/withWebViewSslBypass.js
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withWebViewSslBypass(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const filePath = path.join(
        projectRoot,
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

      if (!fs.existsSync(filePath)) {
        console.warn('❌ RNCWebViewClient.java non trovato');
        return config;
      }

      let content = fs.readFileSync(filePath, 'utf8');
      const before = content;

      // 🔓 SOSTITUZIONE MIRATA: cerca handler.cancel() nel contesto di onReceivedSslError
      // e lo sostituisce con handler.proceed()
      
      // Prima verifica che il metodo onReceivedSslError esista
      const hasMethod = /onReceivedSslError\s*\(/.test(content);
      if (!hasMethod) {
        console.warn('⚠️ onReceivedSslError non trovato nel file');
        return config;
      }

      // Conta quante volte appare handler.cancel()
      const cancelCount = (content.match(/handler\.cancel\(\)/g) || []).length;
      console.log(`🔍 Trovate ${cancelCount} occorrenze di handler.cancel()`);

      // Sostituisci tutte le occorrenze (di solito ce n'è solo una, dentro onReceivedSslError)
      content = content.replace(
        /handler\.cancel\(\)/g,
        'handler.proceed() // 🔓 SSL BYPASS'
      );

      // Aggiungi anche un log per debug (opzionale, ma utile)
      // Non tocchiamo il resto del metodo per non rompere nulla

      if (content !== before) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ Patch SSL applicata a: RNCWebViewClient.java (${cancelCount} sostituzioni)`);
      } else {
        console.warn('⚠️ Nessuna sostituzione effettuata');
      }

      return config;
    },
  ]);
};