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
  type: "appeared" | "disappeared";
  platform: "airbnb" | "booking";
  eventType: string;
  event: {
    uid: string;
    summary: string;
    start: string;
    end: string;
  };
}

const SNAPSHOT_KEY = "calendar:snapshot";
const CHANGELOG_KEY = "calendar:changelog";
const MAX_CHANGELOG = 200;

export async function getSnapshot(): Promise<SnapshotEvent[]> {
  const data = await redis.get<SnapshotEvent[]>(SNAPSHOT_KEY);
  return data ?? [];
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
