"use client";

import { useEffect, useState, useCallback } from "react";

type EventType = "airbnb_guest" | "booking_event" | "manual_block" | "sync_gap" | "unknown";

interface BookingEntry {
  uid: string;
  summary: string;
  start: string;
  end: string;
  source: "airbnb" | "booking";
  eventType: EventType;
  reservationUrl?: string;
  phoneLastFour?: string;
}

interface ConflictEntry {
  airbnbUid: string;
  bookingUid: string;
  overlapStart: string;
  overlapEnd: string;
  airbnb: { summary: string; start: string; end: string };
  booking: { summary: string; start: string; end: string };
}

interface ChangelogEntry {
  timestamp: string;
  type: "appeared" | "disappeared";
  platform: "airbnb" | "booking";
  eventType: string;
  event: { uid: string; summary: string; start: string; end: string };
}

interface CalendarData {
  configured: boolean;
  airbnb?: BookingEntry[];
  booking?: BookingEntry[];
  conflicts?: ConflictEntry[];
  changelog?: ChangelogEntry[];
  lastChecked?: string;
  error?: string;
}

interface CalendarDay {
  date: Date;
  airbnb: BookingEntry | null;
  booking: BookingEntry | null;
  isConflict: boolean;
  isSyncGap: boolean;
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
  return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
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
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ds = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const de = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  return d >= ds && d < de;
}

function buildCalendarDays(year: number, month: number, data: CalendarData): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();

  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const days: CalendarDay[] = [];

  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1);
    days.push({ date: d, airbnb: null, booking: null, isConflict: false, isSyncGap: false, isToday: false, isCurrentMonth: false });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const isToday = isSameDay(date, today);

    const airbnbBooking = data.airbnb?.find((b) => isDateInRange(date, b.start, b.end)) || null;
    const bookingBooking = data.booking?.find((b) => isDateInRange(date, b.start, b.end)) || null;

    const isConflict = !!(
      airbnbBooking &&
      bookingBooking &&
      data.conflicts?.some(
        (c) => c.airbnbUid === airbnbBooking.uid && c.bookingUid === bookingBooking.uid
      )
    );

    // Szinkron hiány: Booking.com-on CLOSED van, de Airbnb-n nincs semmi → Airbnb nyitva!
    const isSyncGap = !isConflict && !!bookingBooking && bookingBooking.eventType === "sync_gap" && !airbnbBooking;

    days.push({ date, airbnb: airbnbBooking, booking: bookingBooking, isConflict, isSyncGap, isToday, isCurrentMonth: true });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, airbnb: null, booking: null, isConflict: false, isSyncGap: false, isToday: false, isCurrentMonth: false });
  }

  return days;
}

function eventTypeBadge(type: EventType) {
  switch (type) {
    case "airbnb_guest":
      return <span className="text-[9px] bg-rose-500 text-white rounded px-0.5">Vendég</span>;
    case "booking_event":
      return <span className="text-[9px] bg-blue-500 text-white rounded px-0.5">Booking</span>;
    case "manual_block":
      return <span className="text-[9px] bg-gray-400 text-white rounded px-0.5">Manuális</span>;
    case "sync_gap":
      return <span className="text-[9px] bg-yellow-500 text-white rounded px-0.5">!</span>;
    default:
      return null;
  }
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "airbnb_guest": return "Airbnb vendég";
    case "booking_event": return "Booking.com esemény";
    case "manual_block": return "Manuális zárás (Airbnb-n)";
    case "sync_gap": return "⚠️ Szinkron hiány – Airbnb még nyitva!";
    default: return "Ismeretlen";
  }
}

function DayDetail({ booking, platform }: { booking: BookingEntry | null; platform: string }) {
  const isAirbnb = platform === "airbnb";
  const color = isAirbnb ? "rose" : "blue";

  if (!booking) {
    return <div className="text-gray-400 italic text-xs">Szabad</div>;
  }

  return (
    <div className={`text-gray-600 bg-${color}-50 rounded-lg p-2 space-y-1`}>
      <div className="font-medium">{booking.summary}</div>
      <div className="text-xs">{formatDate(booking.start)} – {formatDate(booking.end)}</div>
      <div className={`text-xs font-medium text-${color}-700`}>{eventTypeLabel(booking.eventType)}</div>
      {booking.eventType === "airbnb_guest" && (
        <div className="text-xs space-y-0.5 mt-1">
          {booking.phoneLastFour && (
            <div className="text-gray-500">Tel. utolsó 4: <strong>{booking.phoneLastFour}</strong></div>
          )}
          {booking.reservationUrl && (
            <a
              href={booking.reservationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-600 underline block"
            >
              Foglalás megtekintése →
            </a>
          )}
        </div>
      )}
    </div>
  );
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
  const [showChangelog, setShowChangelog] = useState(false);

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
        setCheckResult(`✅ Nincs dupla foglalás.${json.changes > 0 ? ` (${json.changes} változás rögzítve)` : ""}`);
      }
      fetchData();
    } catch {
      setCheckResult("❌ Hiba a manuális ellenőrzés során.");
    } finally {
      setChecking(false);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const calendarDays = data?.configured ? buildCalendarDays(currentYear, currentMonth, data) : [];
  const conflictCount = data?.conflicts?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Naptár Szinkron</h1>
            <p className="text-sm text-gray-500">Dupla foglalás figyelő – Booking.com & Airbnb</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {data?.lastChecked && (
              <span className="text-xs text-gray-400">
                Utolsó ellenőrzés: {new Date(data.lastChecked).toLocaleTimeString("hu-HU")}
              </span>
            )}
            <button
              onClick={() => setShowChangelog((v) => !v)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Változásnapló {data?.changelog && data.changelog.length > 0 ? `(${data.changelog.length})` : ""}
            </button>
            <button
              onClick={handleManualCheck}
              disabled={checking || !data?.configured}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {checking ? "Ellenőrzés..." : "Manuális ellenőrzés"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Check result */}
        {checkResult && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            checkResult.startsWith("⚠️") ? "bg-red-50 text-red-700 border border-red-200"
            : checkResult.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
          }`}>
            {checkResult}
          </div>
        )}

        {/* Not configured */}
        {data && !data.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-semibold text-amber-800 mb-2">Beállítás szükséges</h2>
            <p className="text-sm text-amber-700 mb-3">Állítsd be a következő környezeti változókat:</p>
            <ul className="text-sm text-amber-700 space-y-1 font-mono">
              <li>• <strong>AIRBNB_ICAL_URL</strong></li>
              <li>• <strong>BOOKING_ICAL_URL</strong></li>
              <li>• <strong>TWILIO_ACCOUNT_SID</strong></li>
              <li>• <strong>TWILIO_AUTH_TOKEN</strong></li>
              <li>• <strong>TWILIO_FROM_NUMBER</strong></li>
              <li>• <strong>ALERT_PHONE_NUMBER</strong></li>
            </ul>
          </div>
        )}

        {/* Stats */}
        {data?.configured && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-rose-500">{data.airbnb?.length ?? 0}</div>
              <div className="text-sm text-gray-500 mt-1">Airbnb foglalás</div>
              <div className="mt-1 text-xs text-gray-400">következő 6 hónap</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{data.booking?.length ?? 0}</div>
              <div className="text-sm text-gray-500 mt-1">Booking foglalás</div>
              <div className="mt-1 text-xs text-gray-400">következő 6 hónap</div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${conflictCount > 0 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-200"}`}>
              <div className={`text-2xl font-bold ${conflictCount > 0 ? "text-red-600" : "text-green-600"}`}>{conflictCount}</div>
              <div className={`text-sm mt-1 ${conflictCount > 0 ? "text-red-500" : "text-green-600"}`}>
                {conflictCount > 0 ? "⚠️ Dupla foglalás!" : "✅ Nincs konfliktus"}
              </div>
            </div>
          </div>
        )}

        {/* Conflict details */}
        {data?.configured && conflictCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-red-800">⚠️ Dupla foglalások részletei</h3>
            {data.conflicts?.map((c, i) => (
              <div key={i} className="bg-white border border-red-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-red-700 mb-1">
                  Átfedés: {formatDate(c.overlapStart)} – {formatDate(c.overlapEnd)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-600">
                  <div>
                    <span className="font-medium text-rose-600">Airbnb:</span> {c.airbnb.summary}<br />
                    <span className="text-xs">{formatDate(c.airbnb.start)} – {formatDate(c.airbnb.end)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-600">Booking:</span> {c.booking.summary}<br />
                    <span className="text-xs">{formatDate(c.booking.start)} – {formatDate(c.booking.end)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Changelog */}
        {showChangelog && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Változásnapló</h3>
            {(!data?.changelog || data.changelog.length === 0) ? (
              <p className="text-sm text-gray-400">Még nincs rögzített változás. Futtass egy manuális ellenőrzést!</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data.changelog.map((entry, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2 rounded-lg text-sm ${
                    entry.type === "appeared" ? "bg-green-50" : "bg-red-50"
                  }`}>
                    <span className="text-lg">{entry.type === "appeared" ? "+" : "−"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${entry.platform === "airbnb" ? "text-rose-600" : "text-blue-600"}`}>
                          {entry.platform === "airbnb" ? "Airbnb" : "Booking.com"}
                        </span>
                        <span className="text-gray-500 text-xs">{eventTypeLabel(entry.eventType)}</span>
                        <span className={`text-xs font-medium ${entry.type === "appeared" ? "text-green-700" : "text-red-700"}`}>
                          {entry.type === "appeared" ? "megjelent" : "eltűnt"}
                        </span>
                      </div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        {formatDate(entry.event.start)} – {formatDate(entry.event.end)}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {new Date(entry.timestamp).toLocaleString("hu-HU")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {data?.configured && (
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Jelmagyarázat</div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-500"></div>Airbnb vendég</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500"></div>Booking vendég</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gray-400"></div>Manuális zárás (Airbnb-n)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-400"></div>⚠️ Szinkron hiány – Booking.com zárva, Airbnb nyitva!</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500"></div>⚠️ Dupla foglalás</div>
            </div>
          </div>
        )}

        {/* Calendar */}
        {data?.configured && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">‹</button>
              <h2 className="font-semibold text-gray-800">{MONTHS_HU[currentMonth]} {currentYear}</h2>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">›</button>
            </div>

            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS_HU.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400 text-sm">Betöltés...</div>
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
                  } else if (day.isSyncGap) {
                    bgClass = "bg-yellow-100 border-yellow-300";
                  } else if (hasAirbnb && hasBooking) {
                    bgClass = "bg-purple-100";
                  } else if (hasAirbnb) {
                    const t = day.airbnb!.eventType;
                    bgClass = t === "airbnb_guest" ? "bg-rose-100" : t === "manual_block" ? "bg-gray-100" : "bg-rose-50";
                  } else if (hasBooking) {
                    const t = day.booking!.eventType;
                    bgClass = t === "booking_event" ? "bg-blue-100" : t === "sync_gap" ? "bg-yellow-100" : "bg-gray-100";
                  }

                  return (
                    <div
                      key={i}
                      onClick={() => day.isCurrentMonth && (hasAirbnb || hasBooking) && setSelectedDay(selectedDay?.date === day.date ? null : day)}
                      className={`min-h-[52px] p-1.5 border-b border-r border-gray-100 ${bgClass} ${day.isCurrentMonth && (hasAirbnb || hasBooking) ? "cursor-pointer hover:opacity-80" : ""} ${day.isToday ? "ring-2 ring-blue-400 ring-inset" : ""}`}
                    >
                      <div className={`text-xs font-medium mb-0.5 ${!day.isCurrentMonth ? "text-gray-300" : day.isConflict ? "text-white" : day.isToday ? "text-blue-600" : "text-gray-700"}`}>
                        {day.date.getDate()}
                      </div>
                      {day.isCurrentMonth && (
                        <div className="space-y-0.5">
                          {hasAirbnb && !day.isConflict && (
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] text-rose-700 bg-rose-200 rounded px-0.5">A</span>
                              {eventTypeBadge(day.airbnb!.eventType)}
                            </div>
                          )}
                          {hasBooking && !day.isConflict && (
                            <div className="flex items-center gap-0.5">
                              <span className="text-[9px] text-blue-700 bg-blue-200 rounded px-0.5">B</span>
                              {eventTypeBadge(day.booking!.eventType)}
                            </div>
                          )}
                          {day.isConflict && <div className="text-[9px] text-white font-bold">⚠️</div>}
                          {day.isSyncGap && <div className="text-[9px] text-yellow-700 font-bold">!</div>}
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
              {selectedDay.date.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" })}
              {selectedDay.isConflict && <span className="ml-2 text-sm text-red-600 font-normal">⚠️ Dupla foglalás!</span>}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
                  <span className="font-medium text-gray-700">Airbnb</span>
                </div>
                <DayDetail booking={selectedDay.airbnb} platform="airbnb" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
                  <span className="font-medium text-gray-700">Booking.com</span>
                </div>
                <DayDetail booking={selectedDay.booking} platform="booking" />
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="bg-gray-100 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p>Automatikus ellenőrzés: naponta reggel 8-kor (Vercel Cron). Dupla foglalás esetén SMS értesítés.</p>
          <p>Az app csak figyel, semmit sem módosít egyik platformon sem.</p>
        </div>
      </div>
    </div>
  );
}
