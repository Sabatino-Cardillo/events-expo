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
import * as WebBrowser from 'expo-web-browser';
import { fetchEvents, sortStreams } from '../../services/api';
import { SportEvent, Stream } from '../../services/types';

let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// 🖥️ User agent desktop — Chrome Windows
const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 🎯 Referer fisso
const REFERER = 'https://azione.direttecommunity.online/';
const TRACKING_DOMAIN = 'rise-u.vip';

function isTrackingUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === TRACKING_DOMAIN || hostname.endsWith(`.${TRACKING_DOMAIN}`);
  } catch {
    return false;
  }
}

// 💉 Script iniettato per forzare il video player e rimuovere gli annunci
const INJECT_SCRIPT = `
(function() {
  if (window.__nexusInjected) return;
  window.__nexusInjected = true;

  try {
    window.open = function() { return null; };
    window.alert = function() {};
    window.confirm = function() { return false; };
  } catch(e) {}

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
        }
        video {
          object-fit: contain !important;
          width: 100vw !important;
          height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 999999 !important;
          background: #000 !important;
        }
        .ad, .ads, .ad-container, [class*="ad-"], [id*="ad-"],
        [class*="popup"], [id*="popup"], [class*="banner"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        a[href*="rise-u.vip"] {
          pointer-events: none !important;
        }
      \`;
      doc.head.appendChild(style);
    } catch(e) {}
  };

  var forcePlayback = function(doc) {
    try {
      applyStyles(doc);
      var videos = doc.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        v.setAttribute('playsinline', 'true');
        v.setAttribute('webkit-playsinline', 'true');
        v.muted = false;
        v.defaultMuted = false;
        v.volume = 1.0;
        v.controls = true;
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

  forcePlayback(document);
  setInterval(function() { forcePlayback(document); }, 500);

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
      if (Platform.OS === 'android') {
        await WebBrowser.openBrowserAsync(currentStream.url, {
          toolbarColor: '#0d1117',
          controlsColor: '#00d47e',
          showTitle: true,
          enableBarCollapsing: true,
          showInRecents: false,
        });
      } else {
        await Linking.openURL(currentStream.url);
      }
    } catch (e) {
      console.error('Errore apertura browser:', e);
      try {
        await Linking.openURL(currentStream.url);
      } catch {}
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

    // 📱 iOS & ANDROID: WebView con configurazioni ottimizzate per evitare lo schermo nero
    const headers: Record<string, string> = { Referer: REFERER };
    if (Platform.OS === 'ios') {
      headers['User-Agent'] = PC_USER_AGENT;
    }

    return (
      <View style={styles.playerContainer}>
        <WebView
          key={webviewKey}
          ref={webViewRef}
          source={{ uri: finalUrl, headers }}
          style={styles.webview}
          userAgent={Platform.OS === 'ios' ? PC_USER_AGENT : undefined}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={true}
          mixedContentMode="always"
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          originWhitelist={['*']}
          androidLayerType="hardware"
          onShouldStartLoadWithRequest={(req: any) => {
            const url: string = req.url || '';
            if (
              url.startsWith('about:') ||
              url.startsWith('data:') ||
              url.startsWith('blob:') ||
              url.startsWith('javascript:')
            ) {
              return true;
            }
            if (isTrackingUrl(url)) {
              console.warn('[WEBVIEW] Navigazione tracker bloccata:', url);
              return false;
            }
            if (
              url.startsWith('intent:') ||
              url.startsWith('market:') ||
              url.startsWith('whatsapp:') ||
              url.startsWith('tg:')
            ) {
              return false;
            }
            return true;
          }}
          injectedJavaScriptBeforeContentLoaded={INJECT_SCRIPT}
          injectedJavaScript={INJECT_SCRIPT}
          onMessage={(event: any) => {
            const msg = event?.nativeEvent?.data || '';
            console.log('[WEBVIEW MSG]', msg);
          }}
          onLoadStart={() => {
            setWebviewLoading(true);
            setWebviewError(null);
          }}
          onLoadEnd={() => {
            setWebviewLoading(false);
          }}
          onError={(e: any) => {
            const msg = e.nativeEvent?.description || '';
            setWebviewLoading(false);
            setWebviewError(msg || 'Impossibile caricare lo stream');
          }}
          onHttpError={(e: any) => {
            if (e.nativeEvent?.statusCode >= 400) {
              setWebviewError(`HTTP ${e.nativeEvent.statusCode}`);
            }
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
    ...StyleSheet.absoluteFill,
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