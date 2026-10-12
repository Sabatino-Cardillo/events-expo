import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fetchEvents, hasItalian } from '../services/api';
import { SportEvent } from '../services/types';

// 🔍 Rileva se stiamo girando su TV (Android TV, Apple TV, Fire TV)
const IS_TV = Platform.isTV === true;

// 🎯 Ordine di priorità dei campionati (i più seguiti in alto)
const LEAGUE_ORDER = [
  'Italian Serie A',
  'Spanish La Liga',
  'German Bundesliga',
  'English Premier League',
  'UEFA Champions League',
  'UEFA Europa League',
  'French Ligue 1',
  'Portuguese Primeira Liga',
  'Dutch Eredivisie',
  'Italian Serie B',
  'Spanish La Liga 2',
  'German 2. Bundesliga',
  'English League Championship',
  'Brazilian Serie A',
  'Argentinian Primera Division',
  'NBA',
  'Italian Lega Basket',
  'Spanish Liga ACB',
  'MLB',
  'NHL',
  'NFL',
  'ATP',
  'WTA',
  'Polish Ekstraklasa',
];

// 🏷️ Etichette leggibili per le sezioni
const LEAGUE_LABELS: Record<string, string> = {
  'Italian Serie A': '🇮🇹 Serie A',
  'Italian Serie B': '🇮🇹 Serie B',
  'Spanish La Liga': '🇪🇸 La Liga',
  'Spanish La Liga 2': '🇪🇸 La Liga 2',
  'German Bundesliga': '🇩🇪 Bundesliga',
  'German 2. Bundesliga': '🇩🇪 2. Bundesliga',
  'English Premier League': '🏴 Premier League',
  'English League Championship': '🏴 Championship',
  'UEFA Champions League': '🏆 Champions League',
  'UEFA Europa League': '🏆 Europa League',
  'French Ligue 1': '🇫🇷 Ligue 1',
  'French Ligue 2': '🇫🇷 Ligue 2',
  'Portuguese Primeira Liga': '🇵🇹 Primeira Liga',
  'Portuguese LigaPro': '🇵🇹 Liga Portugal 2',
  'Dutch Eredivisie': '🇳🇱 Eredivisie',
  'Brazilian Serie A': '🇧🇷 Brasileirão',
  'Brazilian Serie B': '🇧🇷 Série B',
  'Argentinian Primera Division': '🇦🇷 Primera División',
  'Mexican Primera League': '🇲🇽 Liga MX',
  'Turkish Super Lig': '🇹🇷 Süper Lig',
  'Greek Super League 1': '🇬🇷 Super League',
  'Belgian Pro League': '🇧🇪 Pro League',
  'Danish Superliga': '🇩🇰 Superliga',
  'Norwegian Eliteserien': '🇳🇴 Eliteserien',
  'Swedish Allsvenskan': '🇸🇪 Allsvenskan',
  'Austrian Bundesliga': '🇦🇹 Bundesliga',
  'Swiss Super League': '🇨🇭 Super League',
  'Ukrainian Premier League': '🇺🇦 Premier League',
  'Serbian Super Liga': '🇷🇸 Super Liga',
  'Czech First League': '🇨🇿 First League',
  'Saudi-Arabian Pro League': '🇸🇦 Saudi Pro League',
  'Chinese Super League': '🇨🇳 Super League',
  'AFC Champions League Elite': '🏆 AFC Champions League',
  'NBA': '🏀 NBA',
  'Italian Lega Basket': '🏀 Lega Basket',
  'Spanish Liga ACB': '🏀 Liga ACB',
  'Spanish Primera FEB': '🏀 Primera FEB',
  'Spanish Segunda FEB': '🏀 Segunda FEB',
  'German BBL': '🏀 BBL',
  'Turkish Basketbol Super Ligi': '🏀 Basketbol Süper Ligi',
  'EUROPA: Liga ABA': '🏀 ABA Liga',
  'POLSKA: Basket Liga': '🏀 Basket Liga',
  'MLB': '⚾ MLB',
  'Korean KBO League': '⚾ KBO',
  'NHL': '🏒 NHL',
  'NFL': '🏈 NFL',
  'English Prem Rugby': '🏉 Premiership Rugby',
  'French Top 14': '🏉 Top 14',
  'ATP': '🎾 ATP',
  'WTA': '🎾 WTA',
};

// 🌐 Dominio Cloudflare DoH
const CF_DOH = 'https://1.1.1.1/dns-query';

// Estrae il dominio di streaming da usare per il pre-flight DoH
function getStreamingDomain(events: SportEvent[]): string {
  for (const ev of events) {
    for (const s of ev.streams || []) {
      try {
        const host = new URL(s.url).hostname;
        // Rimuove eventuale prefisso tipo "ww1." per ottenere il dominio base
        return host.replace(/^ww\d+\./, '');
      } catch {}
    }
  }
  return 'sportsonnline.click';
}

// Pre-flight DoH su Cloudflare (1.1.1.1)
async function cloudflareDohWarmup(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `${CF_DOH}?name=${encodeURIComponent(domain)}&type=A`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    console.log('DoH warm-up bypassed:', e);
    return false;
  }
}

// Etichetta leggibile per la lega
function leagueLabel(league: string): string {
  return LEAGUE_LABELS[league] || league || 'Altri eventi';
}

// Formatta la data/ora
function timeLabel(ev: SportEvent): string {
  if (ev.status === 'live') return '🔴 LIVE';
  const d = new Date(ev.start_time);
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Section {
  key: string;
  title: string;
  events: SportEvent[];
}

export default function HomeScreen() {
  const router = useRouter();
  const searchInputRef = useRef<TextInput>(null);

  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dohReady, setDohReady] = useState(false);

  // 🌐 Pre-flight Cloudflare DoH: riscalda la connessione a 1.1.1.1
  useEffect(() => {
    let mounted = true;
    (async () => {
      const domain = getStreamingDomain(events);
      await cloudflareDohWarmup(domain);
      if (mounted) setDohReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [events]);

  // Carica eventi
  const loadEvents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch (e: any) {
      setError(e?.message ?? 'Errore di rete');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 🔍 Ricerca globale: se c'è del testo, mostro una lista piatta
  const isSearching = search.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = search.trim().toLowerCase();
    return events
      .filter((e) => {
        const hay = `${e.title} ${e.home_team} ${e.away_team} ${e.league}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
        return a.start_ts - b.start_ts;
      });
  }, [events, search, isSearching]);

  // 📚 Raggruppa per campionato
  const sections = useMemo<Section[]>(() => {
    // 1) Live Now (tutti gli eventi live, indipendentemente dal campionato)
    const liveEvents = events.filter((e) => e.status === 'live');

    // 2) Raggruppa per lega
    const byLeague = new Map<string, SportEvent[]>();
    for (const ev of events) {
      const key = ev.league || ev.sport || 'Altri';
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key)!.push(ev);
    }

    // 3) Ordina le chiavi secondo LEAGUE_ORDER
    const orderedKeys = Array.from(byLeague.keys()).sort((a, b) => {
      const ia = LEAGUE_ORDER.indexOf(a);
      const ib = LEAGUE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const result: Section[] = [];

    if (liveEvents.length > 0) {
      result.push({
        key: '__live__',
        title: '🔴 In diretta ora',
        events: liveEvents.sort((a, b) => a.start_ts - b.start_ts),
      });
    }

    for (const key of orderedKeys) {
      const list = byLeague.get(key)!;
      // Non ripetere i live (già mostrati in "In diretta")
      const nonLive = list.filter((e) => e.status !== 'live');
      if (nonLive.length === 0) continue;
      result.push({
        key,
        title: leagueLabel(key),
        events: nonLive.sort((a, b) => a.start_ts - b.start_ts),
      });
    }

    return result;
  }, [events]);

  // Card orizzontale (per le sezioni)
  const renderCard = (item: SportEvent) => {
    const it = hasItalian(item);
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, IS_TV && styles.cardTV]}
        focusable
        activeOpacity={0.7}
        onPress={() => router.push(`/player/${item.id}`)}
      >
        <View style={styles.cardTop}>
          {item.home_team_badge && (
            <Image source={{ uri: item.home_team_badge }} style={styles.cardBadge} />
          )}
          {item.away_team_badge && (
            <Image source={{ uri: item.away_team_badge }} style={styles.cardBadge} />
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.home_team} vs {item.away_team}
        </Text>
        <View style={styles.cardBottom}>
          <Text
            style={[
              styles.cardStatus,
              item.status === 'live' && styles.cardStatusLive,
            ]}
          >
            {timeLabel(item)}
          </Text>
          {it && <Text style={styles.cardIt}>🇮🇹</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // Card verticale (per i risultati di ricerca)
  const renderRow = ({ item }: { item: SportEvent }) => {
    const it = hasItalian(item);
    return (
      <TouchableOpacity
        style={[styles.row, IS_TV && styles.rowTV]}
        focusable
        activeOpacity={0.7}
        onPress={() => router.push(`/player/${item.id}`)}
      >
        <View style={styles.rowBadges}>
          {item.home_team_badge && (
            <Image source={{ uri: item.home_team_badge }} style={styles.rowBadge} />
          )}
          {item.away_team_badge && (
            <Image source={{ uri: item.away_team_badge }} style={styles.rowBadge} />
          )}
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.home_team} vs {item.away_team}
          </Text>
          <Text style={styles.rowLeague} numberOfLines={1}>
            {item.league || item.sport}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text
            style={[
              styles.rowStatus,
              item.status === 'live' && styles.rowStatusLive,
            ]}
          >
            {timeLabel(item)}
          </Text>
          {it && <Text style={styles.rowIt}>🇮🇹 IT</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // ---------- RENDER ----------

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00d47e" />
        <Text style={styles.muted}>Caricamento eventi…</Text>
      </View>
    );
  }

  if (error && events.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>❌ {error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => loadEvents()}>
          <Text style={styles.buttonText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container} autoFocus>
      {/* 🔍 BARRA DI RICERCA FISSA IN ALTO */}
      <View style={styles.searchWrap}>
        <TextInput
          ref={searchInputRef}
          style={[styles.search, IS_TV && styles.searchTV]}
          placeholder="🔎 Cerca squadra, campionato…"
          placeholderTextColor="#8b949e"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {isSearching && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => setSearch('')}
            focusable
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 📱 Badge DNS Cloudflare (piccolo indicatore) */}
      {dohReady && (
        <View style={styles.dohBadge}>
          <Text style={styles.dohBadgeText}>🌐 DNS Cloudflare 1.1.1.1</Text>
        </View>
      )}

      {/* CONTENUTO */}
      {isSearching ? (
        // 🔎 Vista di ricerca: lista piatta verticale
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>Nessun risultato per "{search}"</Text>
          }
        />
      ) : (
        // 📚 Vista a sezioni (scroll verticale + scroll orizzontale per sezione)
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadEvents(true)}
              tintColor="#00d47e"
            />
          }
        >
          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={[styles.sectionTitle, IS_TV && styles.sectionTitleTV]}>
                {section.title}
              </Text>
              <FlatList
                horizontal
                data={section.events}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderCard(item)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListContent}
              />
            </View>
          ))}
          {sections.length === 0 && (
            <Text style={styles.empty}>Nessun evento disponibile</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const CARD_WIDTH = IS_TV ? 280 : 200;
const CARD_HEIGHT = IS_TV ? 180 : 140;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  // Ricerca
  searchWrap: {
    padding: IS_TV ? 24 : 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1117',
  },
  search: {
    flex: 1,
    backgroundColor: '#161b22',
    color: '#e6edf3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d333b',
    fontSize: 15,
  },
  searchTV: {
    fontSize: 20,
    paddingVertical: 18,
    paddingHorizontal: 22,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 10,
    backgroundColor: '#2d333b',
    borderRadius: 10,
  },
  clearBtnText: { color: '#e6edf3', fontWeight: '700', fontSize: 16 },

  // Badge DoH
  dohBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: IS_TV ? 24 : 12,
    marginBottom: 6,
    backgroundColor: '#1f6feb22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dohBadgeText: { color: '#79b8ff', fontSize: 11, fontWeight: '600' },

  // Sezioni
  scrollContent: { paddingBottom: 40 },
  section: { marginBottom: IS_TV ? 32 : 22 },
  sectionTitle: {
    color: '#e6edf3',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  sectionTitleTV: { fontSize: 24, paddingHorizontal: 24 },
  hListContent: { paddingHorizontal: IS_TV ? 24 : 12, gap: IS_TV ? 16 : 10 },

  // Card orizzontale
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2d333b',
    justifyContent: 'space-between',
  },
  cardTV: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
  },
  cardTop: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  cardBadge: { width: 40, height: 40, resizeMode: 'contain' },
  cardTitle: {
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 6,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardStatus: { color: '#8b949e', fontSize: 11, fontWeight: '700' },
  cardStatusLive: { color: '#ff4747' },
  cardIt: { fontSize: 14 },

  // Lista ricerca (verticale)
  listContent: { padding: 12, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d333b',
  },
  rowTV: { padding: 18, marginBottom: 14, borderWidth: 2 },
  rowBadges: { flexDirection: 'column', gap: 2, marginRight: 12 },
  rowBadge: { width: 28, height: 28, resizeMode: 'contain' },
  rowInfo: { flex: 1 },
  rowTitle: { color: '#e6edf3', fontSize: 14, fontWeight: '600' },
  rowLeague: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowStatus: { color: '#8b949e', fontSize: 11, fontWeight: '700' },
  rowStatusLive: { color: '#ff4747' },
  rowIt: { color: '#4ade80', fontSize: 11, fontWeight: '700' },

  // Utility
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
    gap: 12,
  },
  muted: { color: '#8b949e', fontSize: 13 },
  error: { color: '#ff6b6b', marginBottom: 12 },
  button: {
    backgroundColor: '#00d47e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: '#000', fontWeight: '700' },
  empty: { color: '#8b949e', textAlign: 'center', marginTop: 40, fontSize: 14 },
});