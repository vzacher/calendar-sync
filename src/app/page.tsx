"use client";

import { useEffect, useState, useCallback } from "react";

interface BookingEntry {
  uid: string;
  summary: string;
  start: string;
  end: string;
  source: "airbnb" | "booking";
}

interface ConflictEntry {
  airbnbUid: string;
  bookingUid: string;
  overlapStart: string;
  overlapEnd: string;
  airbnb: { summary: string; start: string; end: string };
  booking: { summary: string; start: string; end: string };
}

interface CalendarData {
  configured: boolean;
  airbnb?: BookingEntry[];
  booking?: BookingEntry[];
  conflicts?: ConflictEntry[];
  lastChecked?: string;
  error?: string;
}

interface CalendarDay {
  date: Date;
  airbnb: BookingEntry | null;
  booking: BookingEntry | null;
  isConflict: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
}

const MONTHS_HU = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];
const DAYS_HU = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const s = new Date(start);
  const e = new Date(end);
  // Normalize to day-level comparison
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ds = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const de = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  // In iCal, end date is exclusive (checkout day is not occupied)
  return d >= ds && d < de;
}

function buildCalendarDays(
  year: number,
  month: number,
  data: CalendarData
): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();

  // Start from Monday
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0

  const days: CalendarDay[] = [];

  // Previous month filler days
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1);
    days.push({
      date: d,
      airbnb: null,
      booking: null,
      isConflict: false,
      isToday: false,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const isToday = isSameDay(date, today);

    const airbnbBooking =
      data.airbnb?.find((b) => isDateInRange(date, b.start, b.end)) || null;
    const bookingBooking =
      data.booking?.find((b) => isDateInRange(date, b.start, b.end)) || null;

    const isConflict = !!(
      airbnbBooking &&
      bookingBooking &&
      data.conflicts?.some(
        (c) =>
          c.airbnbUid === airbnbBooking.uid &&
          c.bookingUid === bookingBooking.uid
      )
    );

    days.push({
      date,
      airbnb: airbnbBooking,
      booking: bookingBooking,
      isConflict,
      isToday,
      isCurrentMonth: true,
    });
  }

  // Fill to complete weeks
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({
      date: d,
      airbnb: null,
      booking: null,
      isConflict: false,
      isToday: false,
      isCurrentMonth: false,
    });
  }

  return days;
}

export default function Dashboard() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar-data");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ configured: false, error: "Nem sikerült betölteni az adatokat." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManualCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/check-conflicts");
      const json = await res.json();
      if (json.conflictsFound > 0) {
        setCheckResult(`⚠️ ${json.conflictsFound} dupla foglalás találva! SMS elküldve.`);
      } else {
        setCheckResult("✅ Nincs dupla foglalás.");
      }
      fetchData();
    } catch {
      setCheckResult("❌ Hiba a manuális ellenőrzés során.");
    } finally {
      setChecking(false);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const calendarDays = data?.configured
    ? buildCalendarDays(currentYear, currentMonth, data)
    : [];

  const conflictCount = data?.conflicts?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              🏠 Naptár Szinkron
            </h1>
            <p className="text-sm text-gray-500">
              Dupla foglalás figyelő – Booking.com & Airbnb
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {data?.lastChecked && (
              <span className="text-xs text-gray-400">
                Utolsó ellenőrzés:{" "}
                {new Date(data.lastChecked).toLocaleTimeString("hu-HU")}
              </span>
            )}
            <button
              onClick={handleManualCheck}
              disabled={checking || !data?.configured}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {checking ? "Ellenőrzés..." : "🔍 Manuális ellenőrzés"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Check result banner */}
        {checkResult && (
          <div
            className={`p-3 rounded-lg text-sm font-medium ${
              checkResult.startsWith("⚠️")
                ? "bg-red-50 text-red-700 border border-red-200"
                : checkResult.startsWith("✅")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-yellow-50 text-yellow-700 border border-yellow-200"
            }`}
          >
            {checkResult}
          </div>
        )}

        {/* Not configured warning */}
        {data && !data.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-semibold text-amber-800 mb-2">
              ⚙️ Beállítás szükséges
            </h2>
            <p className="text-sm text-amber-700 mb-3">
              Az alkalmazás nem találja az iCal URL-eket. Állítsd be a következő
              környezeti változókat a Vercel projektedben:
            </p>
            <ul className="text-sm text-amber-700 space-y-1 font-mono">
              <li>• <strong>AIRBNB_ICAL_URL</strong> – Airbnb naptár export URL</li>
              <li>• <strong>BOOKING_ICAL_URL</strong> – Booking.com naptár export URL</li>
              <li>• <strong>TWILIO_ACCOUNT_SID</strong> – Twilio fiók azonosító</li>
              <li>• <strong>TWILIO_AUTH_TOKEN</strong> – Twilio hitelesítési token</li>
              <li>• <strong>TWILIO_FROM_NUMBER</strong> – Twilio telefonszám (pl. +1...)</li>
              <li>• <strong>ALERT_PHONE_NUMBER</strong> – A te telefonszámod (pl. +36...)</li>
            </ul>
          </div>
        )}

        {/* Stats row */}
        {data?.configured && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-rose-500">
                {data.airbnb?.length ?? 0}
              </div>
              <div className="text-sm text-gray-500 mt-1">Airbnb foglalás</div>
              <div className="mt-2 flex items-center justify-center gap-1">
                <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                <span className="text-xs text-gray-400">következő 6 hónap</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {data.booking?.length ?? 0}
              </div>
              <div className="text-sm text-gray-500 mt-1">Booking foglalás</div>
              <div className="mt-2 flex items-center justify-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <span className="text-xs text-gray-400">következő 6 hónap</span>
              </div>
            </div>
            <div
              className={`rounded-xl border p-4 text-center ${
                conflictCount > 0
                  ? "bg-red-50 border-red-300"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div
                className={`text-2xl font-bold ${
                  conflictCount > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {conflictCount}
              </div>
              <div
                className={`text-sm mt-1 ${
                  conflictCount > 0 ? "text-red-500" : "text-green-600"
                }`}
              >
                {conflictCount > 0 ? "⚠️ Dupla foglalás!" : "✅ Nincs konfliktus"}
              </div>
            </div>
          </div>
        )}

        {/* Conflict details */}
        {data?.configured && conflictCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-red-800">
              ⚠️ Dupla foglalások részletei
            </h3>
            {data.conflicts?.map((c, i) => (
              <div
                key={i}
                className="bg-white border border-red-200 rounded-lg p-3 text-sm"
              >
                <div className="font-medium text-red-700 mb-1">
                  Átfedés: {formatDate(c.overlapStart)} –{" "}
                  {formatDate(c.overlapEnd)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-600">
                  <div>
                    <span className="font-medium text-rose-600">Airbnb:</span>{" "}
                    {c.airbnb.summary}
                    <br />
                    <span className="text-xs">
                      {formatDate(c.airbnb.start)} – {formatDate(c.airbnb.end)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-600">Booking:</span>{" "}
                    {c.booking.summary}
                    <br />
                    <span className="text-xs">
                      {formatDate(c.booking.start)} –{" "}
                      {formatDate(c.booking.end)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Calendar */}
        {data?.configured && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              >
                ‹
              </button>
              <h2 className="font-semibold text-gray-800">
                {MONTHS_HU[currentMonth]} {currentYear}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              >
                ›
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-rose-200 border border-rose-300"></div>
                <span>Airbnb</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-200 border border-blue-300"></div>
                <span>Booking.com</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span>Dupla foglalás ⚠️</span>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS_HU.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-medium text-gray-400 py-2"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            {loading ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                Betöltés...
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const hasAirbnb = !!day.airbnb;
                  const hasBooking = !!day.booking;

                  let bgClass = "";
                  if (!day.isCurrentMonth) {
                    bgClass = "bg-gray-50";
                  } else if (day.isConflict) {
                    bgClass = "bg-red-500";
                  } else if (hasAirbnb && hasBooking) {
                    bgClass = "bg-purple-200";
                  } else if (hasAirbnb) {
                    bgClass = "bg-rose-100";
                  } else if (hasBooking) {
                    bgClass = "bg-blue-100";
                  }

                  return (
                    <div
                      key={i}
                      onClick={() =>
                        day.isCurrentMonth &&
                        (hasAirbnb || hasBooking) &&
                        setSelectedDay(selectedDay?.date === day.date ? null : day)
                      }
                      className={`
                        min-h-[52px] p-1.5 border-b border-r border-gray-100
                        ${bgClass}
                        ${day.isCurrentMonth && (hasAirbnb || hasBooking) ? "cursor-pointer hover:opacity-80" : ""}
                        ${day.isToday ? "ring-2 ring-blue-400 ring-inset" : ""}
                      `}
                    >
                      <div
                        className={`text-xs font-medium mb-0.5 ${
                          !day.isCurrentMonth
                            ? "text-gray-300"
                            : day.isConflict
                            ? "text-white"
                            : day.isToday
                            ? "text-blue-600"
                            : "text-gray-700"
                        }`}
                      >
                        {day.date.getDate()}
                      </div>
                      {day.isCurrentMonth && (
                        <div className="space-y-0.5">
                          {hasAirbnb && !day.isConflict && (
                            <div className="text-[9px] text-rose-700 bg-rose-200 rounded px-0.5 truncate">
                              A
                            </div>
                          )}
                          {hasBooking && !day.isConflict && (
                            <div className="text-[9px] text-blue-700 bg-blue-200 rounded px-0.5 truncate">
                              B
                            </div>
                          )}
                          {day.isConflict && (
                            <div className="text-[9px] text-white font-bold">
                              ⚠️
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Selected day detail */}
        {selectedDay && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">
              📅{" "}
              {selectedDay.date.toLocaleDateString("hu-HU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {selectedDay.isConflict && (
                <span className="ml-2 text-sm text-red-600 font-normal">
                  ⚠️ Dupla foglalás!
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
                  <span className="font-medium text-gray-700">Airbnb</span>
                </div>
                {selectedDay.airbnb ? (
                  <div className="text-gray-600 bg-rose-50 rounded-lg p-2">
                    <div className="font-medium">{selectedDay.airbnb.summary}</div>
                    <div className="text-xs mt-0.5">
                      {formatDate(selectedDay.airbnb.start)} –{" "}
                      {formatDate(selectedDay.airbnb.end)}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 italic text-xs">Szabad</div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
                  <span className="font-medium text-gray-700">Booking.com</span>
                </div>
                {selectedDay.booking ? (
                  <div className="text-gray-600 bg-blue-50 rounded-lg p-2">
                    <div className="font-medium">
                      {selectedDay.booking.summary}
                    </div>
                    <div className="text-xs mt-0.5">
                      {formatDate(selectedDay.booking.start)} –{" "}
                      {formatDate(selectedDay.booking.end)}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 italic text-xs">Szabad</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-gray-100 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p>
            🔄 <strong>Automatikus ellenőrzés:</strong> Óránként fut (Vercel
            Cron). Dupla foglalás esetén SMS értesítés megy.
          </p>
          <p>
            📱 <strong>Manuális ellenőrzés:</strong> A "Manuális ellenőrzés"
            gombra kattintva azonnal lefuttathatod.
          </p>
          <p>
            ℹ️ Az app <strong>csak figyel</strong>, semmit sem módosít egyik
            platformon sem.
          </p>
        </div>
      </div>
    </div>
  );
}
