import { NextResponse } from "next/server";
import { fetchBookings, findConflicts, classifyBookings } from "@/lib/ical";
import { getChangelog } from "@/lib/redis";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const airbnbUrl = process.env.AIRBNB_ICAL_URL;
  const bookingUrl = process.env.BOOKING_ICAL_URL;

  if (!airbnbUrl || !bookingUrl) {
    return NextResponse.json(
      {
        error:
          "Hiányzó iCal URL-ek. Állítsd be az AIRBNB_ICAL_URL és BOOKING_ICAL_URL környezeti változókat.",
        configured: false,
      },
      { status: 200 }
    );
  }

  try {
    const [airbnbRaw, bookingRaw] = await Promise.all([
      fetchBookings(airbnbUrl, "airbnb"),
      fetchBookings(bookingUrl, "booking"),
    ]);

    const { airbnb: airbnbBookings, booking: bookingBookings } = classifyBookings(airbnbRaw, bookingRaw);
    const conflicts = findConflicts(airbnbBookings, bookingBookings);
    const changelog = await getChangelog();

    const now = new Date();
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const filterBookings = (bookings: typeof airbnbBookings) =>
      bookings
        .filter((b) => b.end >= now && b.start <= sixMonthsLater)
        .map((b) => ({
          uid: b.uid,
          summary: b.summary,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          source: b.source,
          eventType: b.eventType,
          reservationUrl: b.reservationUrl,
          phoneLastFour: b.phoneLastFour,
        }));

    return NextResponse.json({
      configured: true,
      airbnb: filterBookings(airbnbBookings),
      booking: filterBookings(bookingBookings),
      conflicts: conflicts.map((c) => ({
        airbnbUid: c.airbnbBooking.uid,
        bookingUid: c.bookingBooking.uid,
        overlapStart: c.overlapStart.toISOString(),
        overlapEnd: c.overlapEnd.toISOString(),
        airbnb: {
          summary: c.airbnbBooking.summary,
          start: c.airbnbBooking.start.toISOString(),
          end: c.airbnbBooking.end.toISOString(),
        },
        booking: {
          summary: c.bookingBooking.summary,
          start: c.bookingBooking.start.toISOString(),
          end: c.bookingBooking.end.toISOString(),
        },
      })),
      changelog: changelog.slice(0, 50),
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hiba a naptár adatok betöltésekor",
        details: error instanceof Error ? error.message : String(error),
        configured: true,
      },
      { status: 500 }
    );
  }
}
