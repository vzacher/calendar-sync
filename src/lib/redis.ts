import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface SnapshotEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  source: "airbnb" | "booking";
  eventType: string;
}

export interface ChangelogEntry {
  timestamp: string;
  type: "appeared" | "disappeared" | "completed";
  platform: "airbnb" | "booking";
  eventType: string;
  event: {
    uid: string;
    summary: string;
    start: string;
    end: string;
  };
}

// Lezárult foglalás — végleg megőrzött történeti adat
export interface HistoryEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  source: "airbnb" | "booking";
  eventType: string;
  firstSeen: string;   // mikor jelent meg először az iCal-ban
  lastSeen: string;    // mikor tűnt el (= mikor lett múltbeli)
}

const SNAPSHOT_KEY = "calendar:snapshot";
const CHANGELOG_KEY = "calendar:changelog";
const HISTORY_KEY = "calendar:history";
const MAX_CHANGELOG = 500;
const MAX_HISTORY = 1000;

export async function getSnapshot(): Promise<SnapshotEvent[]> {
  return await redis.get<SnapshotEvent[]>(SNAPSHOT_KEY) ?? [];
}

export async function saveSnapshot(events: SnapshotEvent[]): Promise<void> {
  await redis.set(SNAPSHOT_KEY, events);
}

export async function addChangelogEntries(entries: ChangelogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existing = await redis.get<ChangelogEntry[]>(CHANGELOG_KEY) ?? [];
  const updated = [...entries, ...existing].slice(0, MAX_CHANGELOG);
  await redis.set(CHANGELOG_KEY, updated);
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
  return await redis.get<ChangelogEntry[]>(CHANGELOG_KEY) ?? [];
}

// Lezárult (múltba kerülő) foglalások permanens tárolása
export async function addHistoryEvents(events: HistoryEvent[]): Promise<void> {
  if (events.length === 0) return;
  const existing = await redis.get<HistoryEvent[]>(HISTORY_KEY) ?? [];
  // Ne duplikáljunk uid alapján
  const existingUids = new Set(existing.map((e) => e.uid));
  const newEvents = events.filter((e) => !existingUids.has(e.uid));
  if (newEvents.length === 0) return;
  const updated = [...existing, ...newEvents].slice(-MAX_HISTORY);
  await redis.set(HISTORY_KEY, updated);
}

export async function getHistory(): Promise<HistoryEvent[]> {
  return await redis.get<HistoryEvent[]>(HISTORY_KEY) ?? [];
}
