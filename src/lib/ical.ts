export interface Booking {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  source: "airbnb" | "booking";
}

export interface Conflict {
  airbnbBooking: Booking;
  bookingBooking: Booking;
  overlapStart: Date;
  overlapEnd: Date;
}

function parseICalDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object" && val !== null && "toJSDate" in val) {
    try {
      return (val as { toJSDate: () => Date }).toJSDate();
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchBookings(
  url: string,
  source: "airbnb" | "booking"
): Promise<Booking[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "CalendarSync/1.0" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source} calendar: ${response.status}`);
  }

  const icalText = await response.text();

  // Parse iCal manually without external library for edge compatibility
  const bookings: Booking[] = [];
  const events = icalText.split("BEGIN:VEVENT");

  for (let i = 1; i < events.length; i++) {
    const event = events[i];

    const uidMatch = event.match(/^UID:(.+)$/m);
    const summaryMatch = event.match(/^SUMMARY:(.+)$/m);
    const dtStartMatch = event.match(/^DTSTART(?:;[^:]*)?:(.+)$/m);
    const dtEndMatch = event.match(/^DTEND(?:;[^:]*)?:(.+)$/m);

    if (!dtStartMatch || !dtEndMatch) continue;

    const uid = uidMatch ? uidMatch[1].trim() : `${source}-${i}`;
    const summary = summaryMatch ? summaryMatch[1].trim() : "Foglalás";

    const start = parseICalDateString(dtStartMatch[1].trim());
    const end = parseICalDateString(dtEndMatch[1].trim());

    if (!start || !end) continue;

    // Skip BLOCKED events (these are the blocks you create yourself, not real bookings from the other platform)
    if (summary === "Not available" || summary === "Blocked") continue;

    bookings.push({ uid, summary, start, end, source });
  }

  return bookings;
}

function parseICalDateString(dateStr: string): Date | null {
  // Format: 20240101 or 20240101T120000Z or 20240101T120000
  const clean = dateStr.replace(/[^\dTZ]/g, "");

  if (clean.length === 8) {
    // Date only: YYYYMMDD
    const year = parseInt(clean.slice(0, 4));
    const month = parseInt(clean.slice(4, 6)) - 1;
    const day = parseInt(clean.slice(6, 8));
    return new Date(year, month, day);
  }

  if (clean.length >= 15) {
    // DateTime: YYYYMMDDTHHmmss[Z]
    const year = parseInt(clean.slice(0, 4));
    const month = parseInt(clean.slice(4, 6)) - 1;
    const day = parseInt(clean.slice(6, 8));
    const hour = parseInt(clean.slice(9, 11));
    const min = parseInt(clean.slice(11, 13));
    const sec = parseInt(clean.slice(13, 15));

    if (clean.endsWith("Z")) {
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }
    return new Date(year, month, day, hour, min, sec);
  }

  return null;
}

export function findConflicts(
  airbnbBookings: Booking[],
  bookingBookings: Booking[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const a of airbnbBookings) {
    for (const b of bookingBookings) {
      // Check overlap: a starts before b ends AND a ends after b starts
      const overlapStart =
        a.start > b.start ? a.start : b.start;
      const overlapEnd = a.end < b.end ? a.end : b.end;

      if (overlapStart < overlapEnd) {
        conflicts.push({
          airbnbBooking: a,
          bookingBooking: b,
          overlapStart,
          overlapEnd,
        });
      }
    }
  }

  return conflicts;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
