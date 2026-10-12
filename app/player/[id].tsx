import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchEvents, sortStreams } from '../../services/api';
import { SportEvent, Stream } from '../../services/types';

let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// 🖥️ User agent desktop — Chrome Windows
const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 🎯 Referer fisso: il sito da cui provengono i link
const REFERER = 'https://azione.direttecommunity.online/';

// 💉 Script iniettato PRIMA del caricamento: maschera il WebView come Chrome
const INJECT_SCRIPT_EARLY = `
(function() {
  try {
    var realUA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
    Object.defineProperty(navigator, 'userAgent', { get: function() { return realUA; }, configurable: true });
    Object.defineProperty(navigator, 'appVersion', { get: function() { return realUA.replace('Mozilla/', ''); }, configurable: true });
    Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true });
    if (!window.chrome) {
      window.chrome = {
        runtime: {},
        loadTimes: function() { return {}; },
        csi: function() { return {}; },
        app: { isInstalled: false }
      };
    }
    Object.defineProperty(navigator, 'plugins', { get: function() { return [1, 2, 3, 4, 5]; }, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: function() { return ['it-IT', 'it', 'en-US', 'en']; }, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 8; }, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 8; }, configurable: true });
    console.log('[NEXUS] WebView mascherato come Chrome');
  } catch(e) { console.log('[NEXUS] Errore mascheramento:', e); }
})();
true;
`;

// 💉 Script iniettato DOPO il caricamento: video fullscreen + report
const INJECT_SCRIPT = `
(function() {
  if (window.__nexusInjected) return;
  window.__nexusInjected = true;
  console.log('[NEXUS] Script installato su: ' + location.href);

  // 🔒 Blocca popup
  try {
    window.open = function() { return null; };
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
  } catch(e) {}

  // 🎨 Stili fullscreen + nascondi ads
  var applyStyles = function(doc) {
    try {
      if (!doc.head) return;
      if (doc.getElementById('nexus-style')) return;
      var style = doc.createElement('style');
      style.id = 'nexus-style';
      style.innerHTML = \`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          width: 100vw !important;
          height: 100vh !important;
          min-height: 100vh !important;
        }
        video {
          object-fit: contain !important;
          width: 100vw !important;
          height: 100vh !important;
          min-width: 100vw !important;
          min-height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 999999 !important;
          background: #000 !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        iframe.player, .player, [data-player], .video-js {
          width: 100vw !important;
          height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 999998 !important;
        }
        .ad, .ads, .ad-container, .adsbygoogle,
        [class*="ad-"], [id*="ad-"],
        [class*="popup"], [id*="popup"],
        [class*="banner"], [class*="overlay-ad"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      \`;
      doc.head.appendChild(style);
    } catch(e) {}
  };

  // 🎬 Forza play + inline
  var forcePlayback = function(doc) {
    try {
      applyStyles(doc);
      var videos = doc.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        v.setAttribute('playsinline', 'true');
        v.setAttribute('webkit-playsinline', 'true');
        v.setAttribute('x5-playsinline', 'true');
        v.setAttribute('preload', 'auto');
        v.muted = false;
        v.defaultMuted = false;
        v.volume = 1.0;
        v.controls = true;
        v.style.display = 'block';
        v.style.visibility = 'visible';
        v.style.width = '100vw';
        v.style.height = '100vh';
        v.style.objectFit = 'contain';
        if (v.paused) {
          v.play().catch(function() {
            v.muted = true;
            v.play().then(function() { v.muted = false; }).catch(function(){});
          });
        }
      }
      var iframes = doc.querySelectorAll('iframe');
      for (var j = 0; j < iframes.length; j++) {
        try {
          if (iframes[j].contentDocument) forcePlayback(iframes[j].contentDocument);
        } catch(e) {}
      }
    } catch(e) {}
  };

  // 🖱️ Simula click sui play button
  var simulateClick = function() {
    try {
      var selectors = [
        'button', '[role="button"]', '.play', '.player-play',
        '[data-play]', '.vjs-big-play-button', '.jw-icon-playback',
        '[class*="play"]', '[id*="play"]'
      ];
      for (var i = 0; i < selectors.length; i++) {
        try {
          var els = document.querySelectorAll(selectors[i]);
          for (var j = 0; j < els.length; j++) {
            els[j].click();
          }
        } catch(e) {}
      }
    } catch(e) {}
  };

  forcePlayback(document);
  setTimeout(simulateClick, 2000);
  setTimeout(simulateClick, 5000);
  setTimeout(simulateClick, 10000);

  setInterval(function() { forcePlayback(document); }, 500);
  setInterval(simulateClick, 3000);

  // 🔍 REPORT: cosa c'è nella pagina
  setTimeout(function() {
    try {
      var report = {
        url: location.href,
        videos: document.querySelectorAll('video').length,
        iframes: document.querySelectorAll('iframe').length,
        iframeSrcs: [],
        buttons: document.querySelectorAll('button').length,
        bodyHTML: document.body ? document.body.innerHTML.substring(0, 300) : 'no body'
      };
      var ifr = document.querySelectorAll('iframe');
      for (var i = 0; i < ifr.length; i++) {
        report.iframeSrcs.push(ifr[i].src || 'no-src');
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(report));
      }
    } catch(e) {}
  }, 3000);

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('NEXUS_READY');
  }
})();
true;
`;

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const webViewRef = useRef<any>(null);

  const [event, setEvent] = useState<SportEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStream, setCurrentStream] = useState<Stream | null>(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const [webviewLoading, setWebviewLoading] = useState(false);
  const [webviewError, setWebviewError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const events = await fetchEvents();
        const found = events.find((e) => e.id === id);
        if (found) {
          setEvent(found);
          const sorted = sortStreams(found.streams || []);
          if (sorted.length > 0) setCurrentStream(sorted[0]);
        } else {
          router.back();
        }
      } catch (e) {
        console.error('Errore caricamento evento:', e);
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const sortedStreams = useMemo(() => {
    if (!event) return [];
    return sortStreams(event.streams || []);
  }, [event]);

  const selectStream = (stream: Stream) => {
    if (currentStream?.url === stream.url) return;
    setCurrentStream(stream);
    setWebviewKey((k) => k + 1);
    setWebviewError(null);
  };

  const openInBrowser = async () => {
    if (!currentStream) return;
    try {
      await Linking.openURL(currentStream.url);
    } catch (e) {
      console.error('Errore apertura browser:', e);
    }
  };

  const renderPlayer = () => {
    if (!currentStream) {
      return (
        <View style={styles.playerContainer}>
          <View style={styles.center}>
            <Text style={styles.muted}>Nessuno stream disponibile</Text>
          </View>
        </View>
      );
    }

    const finalUrl = currentStream.url;

    console.log('========== PLAYER ==========');
    console.log('[PLAYER] URL:', finalUrl);
    console.log('[PLAYER] Referer:', REFERER);
    console.log('============================');

    // 🌐 WEB: iframe
    if (Platform.OS === 'web') {
      return (
        <View style={styles.playerContainer}>
          {/* @ts-ignore */}
          <iframe
            key={webviewKey}
            src={finalUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#000',
            }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </View>
      );
    }

    const headers: Record<string, string> = {
      'User-Agent': PC_USER_AGENT,
      'Referer': REFERER,
    };

    return (
      <View style={styles.playerContainer}>
        <WebView
          key={webviewKey}
          ref={webViewRef}
          source={{ uri: finalUrl, headers }}
          style={styles.webview}
          userAgent={PC_USER_AGENT}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          mixedContentMode="always"
          scrollEnabled={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(req: any) => {
            const url: string = req.url || '';
            console.log('[NAV]', req.navigationType, '→', url);

            if (
              url.startsWith('intent:') ||
              url.startsWith('market:') ||
              url.startsWith('whatsapp:') ||
              url.startsWith('tg:')
            ) {
              console.log('[BLOCK SCHEMA]', url);
              return false;
            }

            const BLOCKED = [
              'doubleclick', 'googlesyndication', 'googleadservices',
              'adservice', 'popads', 'propellerads', 'adsterra',
              'exoclick', 'onclickads', 'popmyads', 'adcash',
              'criteo', 'outbrain', 'taboola', 'mgid',
            ];
            const lower = url.toLowerCase();
            if (BLOCKED.some((d) => lower.includes(d))) {
              console.log('[BLOCK ADS]', url);
              return false;
            }

            return true;
          }}
          injectedJavaScriptBeforeContentLoaded={INJECT_SCRIPT_EARLY}
          injectedJavaScript={INJECT_SCRIPT}
          onMessage={(event: any) => {
            const msg = event?.nativeEvent?.data || '';
            console.log('[WEBVIEW MSG]', msg);
          }}
          onLoadStart={() => {
            console.log('[LOAD START]', finalUrl);
            setWebviewLoading(true);
            setWebviewError(null);
          }}
          onLoadProgress={({ nativeEvent }) => {
            console.log('[LOAD PROGRESS]', Math.round(nativeEvent.progress * 100) + '%');
          }}
          onLoadEnd={() => {
            console.log('[LOAD END]');
            setWebviewLoading(false);
            webViewRef.current?.injectJavaScript(INJECT_SCRIPT);
          }}
          onError={(e: any) => {
            const msg = e.nativeEvent?.description || '';
            console.log('❌ WEBVIEW ERROR:', msg);
            setWebviewLoading(false);
            setWebviewError(msg || 'Impossibile caricare lo stream');
          }}
          onHttpError={(e: any) => {
            console.log('❌ HTTP ERROR:', e.nativeEvent?.statusCode, e.nativeEvent?.url);
            if (e.nativeEvent?.statusCode >= 400) {
              setWebviewError(`HTTP ${e.nativeEvent.statusCode}`);
            }
          }}
          onConsoleMessage={(e: any) => {
            console.log('[WEBVIEW CONSOLE]', e.nativeEvent?.message);
          }}
        />

        {webviewLoading && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#00d47e" />
            <Text style={styles.overlayText}>Caricamento stream…</Text>
          </View>
        )}

        {webviewError && !webviewLoading && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>⚠️ {webviewError}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setWebviewError(null);
                  setWebviewKey((k) => k + 1);
                }}
              >
                <Text style={styles.retryText}>Riprova</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.retryButton, styles.browserButton]}
                onPress={openInBrowser}
              >
                <Text style={styles.retryText}>🌐 Browser</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#00d47e" />
        <Text style={styles.muted}>Caricamento evento…</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.muted}>Evento non trovato</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderPlayer()}

      <View style={styles.info}>
        <Text style={styles.status}>
          {event.status === 'live' ? '🔴 LIVE' : 'Programmato'}
        </Text>
        <Text style={styles.league} numberOfLines={1}>
          {event.league || event.sport}
        </Text>
        <TouchableOpacity style={styles.browserPill} onPress={openInBrowser}>
          <Text style={styles.browserPillText}>🌐</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedStreams}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        renderItem={({ item, index }) => {
          const isActive = currentStream?.url === item.url;
          const isIt = (item.lang || '').toLowerCase().startsWith('it');
          return (
            <TouchableOpacity
              style={[styles.streamItem, isActive && styles.streamActive]}
              onPress={() => selectStream(item)}
            >
              <View style={styles.streamInfo}>
                <Text style={styles.streamLabel}>
                  {item.label || `Op.${index + 1}`}
                </Text>
                <Text style={styles.streamSource}>{item.source}</Text>
              </View>
              <Text style={[styles.streamLang, isIt && styles.streamLangIt]}>
                {isIt ? '🇮🇹 ' : ''}
                {item.lang?.toUpperCase() || '?'}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Nessuno stream per questo evento</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
    gap: 12,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: '#8b949e', fontSize: 13 },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  webview: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 20,
    gap: 10,
  },
  overlayText: { color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  retryButton: {
    backgroundColor: '#00d47e',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  browserButton: { backgroundColor: '#1f6feb' },
  retryText: { color: '#fff', fontWeight: '700' },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d333b',
  },
  status: { color: '#e6edf3', fontWeight: '600' },
  league: { color: '#8b949e', fontSize: 12, flex: 1 },
  browserPill: {
    backgroundColor: '#1f6feb22',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f6feb55',
  },
  browserPillText: { color: '#79b8ff', fontSize: 12, fontWeight: '700' },
  streamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d333b',
  },
  streamActive: { backgroundColor: '#00d47e1a' },
  streamInfo: { flex: 1 },
  streamLabel: { color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  streamSource: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  streamLang: { color: '#8b949e', fontSize: 12, fontWeight: '700' },
  streamLangIt: { color: '#4ade80' },
  empty: { color: '#8b949e', textAlign: 'center', marginTop: 20 },
});