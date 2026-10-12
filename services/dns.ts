// services/dns.ts
import { setServers } from 'react-native-nitro-dns';

export function configureCloudflareDns() {
  // Imposta Cloudflare come resolver DoH
  setServers(['https://1.1.1.1/dns-query']);
  console.log('✅ DNS Cloudflare (1.1.1.1) configurato');
}