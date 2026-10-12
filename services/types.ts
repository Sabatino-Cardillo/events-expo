export interface Stream {
  url: string;
  lang: string;
  source: string;
  label: string;
}

export interface SportEvent {
  id: string;
  title: string;
  home_team: string;
  away_team: string;
  home_team_badge: string | null;
  away_team_badge: string | null;
  sport: string;
  league: string;
  start_time: string;
  start_ts: number;
  status: 'live' | 'scheduled' | string;
  streams: Stream[];
  heat_tier: string;
  sources: string[];
}

export interface EventsResponse {
  generated_at: string;
  elapsed_s: number;
  count: number;
  events: SportEvent[];
}