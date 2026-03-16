import { NextRequest, NextResponse } from "next/server";
import { fetchBookings, findConflicts, formatDate } from "@/lib/ical";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Cron job biztonság: ellenőrizzük a titkos kulcsot
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Vercel cron job-ok is mehetnek authorization nélkül ha ugyanaz a project
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    if (!isVercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const airbnbUrl = process.env.AIRBNB_ICAL_URL;
  const bookingUrl = process.env.BOOKING_ICAL_URL;

  if (!airbnbUrl || !bookingUrl) {
    return NextResponse.json(
      { error: "Hiányzó iCal URL-ek a környezeti változókból" },
      { status: 500 }
    );
  }

  try {
    const [airbnbBookings, bookingBookings] = await Promise.all([
      fetchBookings(airbnbUrl, "airbnb"),
      fetchBookings(bookingUrl, "booking"),
    ]);

    const conflicts = findConflicts(airbnbBookings, bookingBookings);

    if (conflicts.length > 0) {
      // SMS küldés Twilio-val
      const smsResult = await sendSmsAlert(conflicts);

      return NextResponse.json({
        success: true,
        conflictsFound: conflicts.length,
        conflicts: conflicts.map((c) => ({
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
          overlapStart: c.overlapStart.toISOString(),
          overlapEnd: c.overlapEnd.toISOString(),
        })),
        smsSent: smsResult.success,
        smsError: smsResult.error,
      });
    }

    return NextResponse.json({
      success: true,
      conflictsFound: 0,
      message: "Nincs dupla foglalás",
      checkedAt: new Date().toISOString(),
      airbnbBookingsCount: airbnbBookings.length,
      bookingBookingsCount: bookingBookings.length,
    });
  } catch (error) {
    console.error("Hiba az ellenőrzés során:", error);
    return NextResponse.json(
      {
        error: "Hiba történt az ellenőrzés során",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function sendSmsAlert(
  conflicts: Awaited<ReturnType<typeof findConflicts>>
): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const toNumber = process.env.ALERT_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    console.error("Hiányzó Twilio beállítások");
    return { success: false, error: "Hiányzó Twilio beállítások" };
  }

  const conflictDetails = conflicts
    .map(
      (c) =>
        `Airbnb: ${formatDate(c.airbnbBooking.start)}-${formatDate(c.airbnbBooking.end)} | Booking: ${formatDate(c.bookingBooking.start)}-${formatDate(c.bookingBooking.end)}`
    )
    .join("\n");

  const message =
    `⚠️ DUPLA FOGLALÁS FIGYELMEZTETÉS!\n` +
    `${conflicts.length} átfedés találva:\n\n` +
    conflictDetails +
    `\n\nEllenőrizd azonnal a szálláshely foglalásait!`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString(
      "base64"
    );

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: toNumber,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `Twilio hiba: ${response.status}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error("SMS küldési hiba:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
