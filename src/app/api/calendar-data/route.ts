import { NextResponse } from "next/server";
import { fetchBookings, findConflicts } from "@/lib/ical";

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
    const [airbnbBookings, bookingBookings] = await Promise.all([
      fetchBookings(airbnbUrl, "airbnb"),
      fetchBookings(bookingUrl, "booking"),
    ]);

    const conflicts = findConflicts(airbnbBookings, bookingBookings);

    // Csak a következő 6 hónap foglalásait küldjük vissza
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
