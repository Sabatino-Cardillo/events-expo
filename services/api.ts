import { EventsResponse, SportEvent, Stream } from './types';

const API_URL = 'https://azione.direttecommunity.online/api/events.php';

export async function fetchEvents(): Promise<SportEvent[]> {
  const response = await fetch(API_URL, {
    headers: { accept: '*/*' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: EventsResponse = await response.json();
  return data.events ?? [];
}

export function sortStreams(streams: Stream[]): Stream[] {
  const priority = (s: Stream) => {
    const lang = (s.lang || '').toLowerCase();
    if (lang.startsWith('it')) return 0;
    if (lang === 'multi') return 2;
    return 1;
  };
  return [...streams].sort((a, b) => priority(a) - priority(b));
}

export function hasItalian(event: SportEvent): boolean {
  return (event.streams || []).some((s) =>
    (s.lang || '').toLowerCase().startsWith('it')
  );
}