export type EventType =
  | "airbnb_guest"      // Valódi Airbnb foglalás (Reserved)
  | "booking_guest"     // Valódi Booking.com foglalás (Booking.com CLOSED ami megjelenik Airbnb-n Not available-ként)
  | "airbnb_sync"       // Airbnb foglalás szinkronizálva Booking.com-ra
  | "manual_block"      // Manuális zárás (nincs párja a másik platformon)
  | "unknown";

export interface Booking {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  source: "airbnb" | "booking";
  eventType: EventType;
  reservationUrl?: string;
  phoneLastFour?: string;
}

export interface Conflict {
  airbnbBooking: Booking;
  bookingBooking: Booking;
  overlapStart: Date;
  overlapEnd: Date;
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
  const bookings: Booking[] = [];
  const events = icalText.split("BEGIN:VEVENT");

  for (let i = 1; i < events.length; i++) {
    const event = events[i];

    const uidMatch = event.match(/^UID:(.+)$/m);
    const summaryMatch = event.match(/^SUMMARY:(.+)$/m);
    const dtStartMatch = event.match(/^DTSTART(?:;[^:]*)?:(.+)$/m);
    const dtEndMatch = event.match(/^DTEND(?:;[^:]*)?:(.+)$/m);
    const descriptionMatch = event.match(/^DESCRIPTION:(.+)$/m);

    if (!dtStartMatch || !dtEndMatch) continue;

    const uid = uidMatch ? uidMatch[1].trim() : `${source}-${i}`;
    const summary = summaryMatch ? summaryMatch[1].trim() : "Foglalás";

    const start = parseICalDateString(dtStartMatch[1].trim());
    const end = parseICalDateString(dtEndMatch[1].trim());

    if (!start || !end) continue;

    // Skip generic "Not available" or "Blocked" (not platform-specific)
    if (summary === "Not available" || summary === "Blocked") continue;

    let reservationUrl: string | undefined;
    let phoneLastFour: string | undefined;

    if (descriptionMatch) {
      const desc = descriptionMatch[1];
      const urlMatch = desc.match(/Reservation URL: (https?:\/\/\S+)/);
      const phoneMatch = desc.match(/Phone Number \(Last 4 Digits\): (\d{4})/);
      if (urlMatch) reservationUrl = urlMatch[1].replace(/\\n.*/, "").trim();
      if (phoneMatch) phoneLastFour = phoneMatch[1];
    }

    // Initial eventType — will be refined by classifyBookings()
    let eventType: EventType = "unknown";
    if (source === "airbnb" && summary === "Reserved") {
      eventType = "airbnb_guest";
    }

    bookings.push({ uid, summary, start, end, source, eventType, reservationUrl, phoneLastFour });
  }

  return bookings;
}

// Cross-reference the two calendars to classify event types
export function classifyBookings(
  airbnbBookings: Booking[],
  bookingBookings: Booking[]
): { airbnb: Booking[]; booking: Booking[] } {
  const classifiedAirbnb = airbnbBookings.map((a) => {
    if (a.eventType === "airbnb_guest") return a;

    // "Airbnb (Not available)" — check if it has a Booking.com counterpart
    const hasBookingPair = bookingBookings.some((b) => datesOverlap(a, b));
    return {
      ...a,
      eventType: hasBookingPair ? ("booking_guest" as EventType) : ("manual_block" as EventType),
    };
  });

  const classifiedBooking = bookingBookings.map((b) => {
    // Check if this Booking.com CLOSED matches an Airbnb Reserved
    const hasAirbnbGuestPair = airbnbBookings.some(
      (a) => a.eventType === "airbnb_guest" && datesOverlap(a, b)
    );
    if (hasAirbnbGuestPair) return { ...b, eventType: "airbnb_sync" as EventType };

    // Check if it matches an Airbnb Not available (= real Booking.com guest)
    const hasAirbnbBlockPair = airbnbBookings.some(
      (a) => a.summary === "Airbnb (Not available)" && datesOverlap(a, b)
    );
    if (hasAirbnbBlockPair) return { ...b, eventType: "booking_guest" as EventType };

    return { ...b, eventType: "manual_block" as EventType };
  });

  return { airbnb: classifiedAirbnb, booking: classifiedBooking };
}

function datesOverlap(a: Booking, b: Booking): boolean {
  const aStart = a.start.getTime();
  const aEnd = a.end.getTime();
  const bStart = b.start.getTime();
  const bEnd = b.end.getTime();
  return aStart < bEnd && aEnd > bStart;
}

export function findConflicts(
  airbnbBookings: Booking[],
  bookingBookings: Booking[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  // Only real guests can conflict with each other
  const realAirbnb = airbnbBookings.filter((a) => a.eventType === "airbnb_guest");
  const realBooking = bookingBookings.filter((b) => b.eventType === "booking_guest");

  for (const a of realAirbnb) {
    for (const b of realBooking) {
      const overlapStart = a.start > b.start ? a.start : b.start;
      const overlapEnd = a.end < b.end ? a.end : b.end;

      if (overlapStart < overlapEnd) {
        conflicts.push({ airbnbBooking: a, bookingBooking: b, overlapStart, overlapEnd });
      }
    }
  }

  return conflicts;
}

function parseICalDateString(dateStr: string): Date | null {
  const clean = dateStr.replace(/[^\dTZ]/g, "");

  if (clean.length === 8) {
    const year = parseInt(clean.slice(0, 4));
    const month = parseInt(clean.slice(4, 6)) - 1;
    const day = parseInt(clean.slice(6, 8));
    return new Date(year, month, day);
  }

  if (clean.length >= 15) {
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

export function formatDate(date: Date): string {
  return date.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function eventTypeLabel(type: EventType): string {
  switch (type) {
    case "airbnb_guest": return "Airbnb vendég";
    case "booking_guest": return "Booking.com vendég";
    case "airbnb_sync": return "Airbnb szinkron (Airbnb foglalás lezárva)";
    case "manual_block": return "Manuális zárás";
    case "unknown": return "Ismeretlen";
  }
}
