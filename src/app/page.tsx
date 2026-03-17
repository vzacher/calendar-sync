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
  type: "appeared" | "disappeared" | "completed";
  platform: "airbnb" | "booking";
  eventType: string;
  event: { uid: string; summary: string; start: string; end: string };
}

interface HistoryEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  source: "airbnb" | "booking";
  eventType: string;
  firstSeen: string;
  lastSeen: string;
}

interface CalendarData {
  configured: boolean;
  airbnb?: BookingEntry[];
  booking?: BookingEntry[];
  conflicts?: ConflictEntry[];
  changelog?: ChangelogEntry[];
  history?: HistoryEvent[];
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

const MONTHS_HU = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];
const DAYS_HU = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(start);
  const e = new Date(end);
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

  const empty = { airbnb: null, booking: null, isConflict: false, isSyncGap: false, isToday: false, isCurrentMonth: false };
  const days: CalendarDay[] = [];

  for (let i = 0; i < startDow; i++)
    days.push({ date: new Date(year, month, -startDow + i + 1), ...empty });

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const airbnbBooking = data.airbnb?.find((b) => isDateInRange(date, b.start, b.end)) || null;
    const bookingBooking = data.booking?.find((b) => isDateInRange(date, b.start, b.end)) || null;
    const isConflict = !!(airbnbBooking && bookingBooking && data.conflicts?.some(
      (c) => c.airbnbUid === airbnbBooking.uid && c.bookingUid === bookingBooking.uid
    ));
    const isSyncGap = !isConflict && !!bookingBooking && bookingBooking.eventType === "sync_gap" && !airbnbBooking;
    days.push({ date, airbnb: airbnbBooking, booking: bookingBooking, isConflict, isSyncGap, isToday: isSameDay(date, today), isCurrentMonth: true });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++)
    days.push({ date: new Date(year, month + 1, i), ...empty });

  return days;
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "airbnb_guest": return "Airbnb vendégfoglalás";
    case "booking_event": return "Booking.com foglalás";
    case "manual_block": return "Manuálisan zárolt (Airbnb)";
    case "sync_gap": return "Szinkron hiány – Airbnb nyitva!";
    case "completed": return "Lezárult";
    default: return "Ismeretlen";
  }
}

function humanSummary(entry: BookingEntry): string {
  switch (entry.eventType) {
    case "airbnb_guest": return "Airbnb vendégfoglalás";
    case "booking_event": return "Booking.com foglalás";
    case "manual_block": return "Manuálisan zárolt";
    case "sync_gap": return "Booking.com zárva – Airbnb még nyitva!";
    default: return entry.summary;
  }
}

function uniqueByUid(bookings: BookingEntry[]): BookingEntry[] {
  const seen = new Set<string>();
  return bookings.filter((b) => { if (seen.has(b.uid)) return false; seen.add(b.uid); return true; });
}

function DayDetail({ booking }: { booking: BookingEntry | null }) {
  if (!booking) return <p className="text-sm text-gray-400 italic">Szabad</p>;
  return (
    <div className="text-sm space-y-1">
      <p className="font-medium text-gray-800">{humanSummary(booking)}</p>
      <p className="text-gray-500 text-xs">{formatDate(booking.start)} – {formatDate(booking.end)}</p>
      {booking.eventType === "airbnb_guest" && (
        <div className="text-xs space-y-0.5 pt-1">
          {booking.phoneLastFour && <p className="text-gray-500">Telefonszám (utolsó 4): <strong>{booking.phoneLastFour}</strong></p>}
          {booking.reservationUrl && (
            <a href={booking.reservationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Foglalás megtekintése →
            </a>
          )}
        </div>
      )}
      {booking.eventType === "sync_gap" && (
        <p className="text-xs text-orange-600">Az Airbnb naptárban ezek a napok még elérhetők!</p>
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
  const [showHistory, setShowHistory] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar-data");
      setData(await res.json());
    } catch {
      setData({ configured: false, error: "Nem sikerült betölteni az adatokat." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleManualCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/check-conflicts");
      const json = await res.json();
      setCheckResult(json.conflictsFound > 0
        ? `Figyelem: ${json.conflictsFound} dupla foglalás találva!`
        : `Rendben – nincs dupla foglalás.${json.changes > 0 ? ` (${json.changes} változás rögzítve)` : ""}`
      );
      fetchData();
    } catch {
      setCheckResult("Hiba az ellenőrzés során.");
    } finally {
      setChecking(false);
    }
  };

  const navigateToDate = (dateStr: string) => {
    const d = new Date(dateStr);
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
    setTimeout(() => document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const calendarDays = data?.configured ? buildCalendarDays(currentYear, currentMonth, data) : [];
  const conflictCount = data?.conflicts?.length ?? 0;
  const manualBlocks = uniqueByUid((data?.airbnb ?? []).filter(b => b.eventType === "manual_block"));
  const airbnbGuestCount = (data?.airbnb ?? []).filter(b => b.eventType === "airbnb_guest").length;
  const bookingEventCount = (data?.booking ?? []).filter(b => b.eventType === "booking_event").length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Naptár Szinkron</h1>
            <p className="text-sm text-gray-500">Airbnb & Booking.com dupla foglalás figyelő</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {data?.lastChecked && (
              <span className="text-xs text-gray-400">Utolsó ellenőrzés: {new Date(data.lastChecked).toLocaleTimeString("hu-HU")}</span>
            )}
            <div className="flex flex-row flex-wrap gap-2">
              <button onClick={() => setShowHistory(v => !v)} className="px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Előzmények {data?.history?.length ? `(${data.history.length})` : ""}
              </button>
              <button onClick={() => setShowChangelog(v => !v)} className="px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Változásnapló {data?.changelog?.length ? `(${data.changelog.length})` : ""}
              </button>
              <button
                onClick={handleManualCheck}
                disabled={checking || !data?.configured}
                className="px-3 py-1.5 text-xs sm:text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40"
              >
                {checking ? "Ellenőrzés..." : "Ellenőrzés most"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 space-y-4">

        {/* Check result */}
        {checkResult && (
          <div className={`px-4 py-3 rounded-lg text-sm border ${
            checkResult.startsWith("Figyelem") ? "border-red-300 bg-red-50 text-red-800"
            : checkResult.startsWith("Rendben") ? "border-green-300 bg-green-50 text-green-800"
            : "border-gray-300 bg-gray-50 text-gray-700"
          }`}>
            {checkResult}
          </div>
        )}

        {/* Not configured */}
        {data && !data.configured && (
          <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
            <p className="font-medium text-orange-800 mb-2">Beállítás szükséges</p>
            <p className="text-sm text-orange-700 mb-2">Állítsd be a következő környezeti változókat Vercelen:</p>
            <ul className="text-sm text-orange-700 font-mono space-y-0.5">
              <li>AIRBNB_ICAL_URL</li>
              <li>BOOKING_ICAL_URL</li>
              <li>TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_PHONE_NUMBER</li>
            </ul>
          </div>
        )}

        {/* Stats */}
        {data?.configured && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Airbnb foglalás", value: airbnbGuestCount, sub: "következő 6 hónap" },
              { label: "Booking.com foglalás", value: bookingEventCount, sub: "következő 6 hónap" },
              { label: "Manuális zárás", value: manualBlocks.length, sub: "Airbnb-n" },
              {
                label: conflictCount > 0 ? "Dupla foglalás – ellenőrizd!" : "Nincs dupla foglalás",
                value: conflictCount,
                sub: "",
                alert: conflictCount > 0,
              },
            ].map((s, i) => (
              <div key={i} className={`bg-white rounded-lg border p-4 text-center ${s.alert ? "border-red-400" : "border-gray-200"}`}>
                <div className={`text-2xl font-bold ${s.alert ? "text-red-600" : "text-gray-800"}`}>{s.value}</div>
                <div className={`text-xs mt-1 ${s.alert ? "text-red-600 font-medium" : "text-gray-600"}`}>{s.label}</div>
                {s.sub && <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Manual blocks */}
        {data?.configured && manualBlocks.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-medium text-gray-800 mb-1">Manuálisan zárolt időszakok (Airbnb)</h2>
            <p className="text-xs text-gray-400 mb-3">Airbnb-n kézzel lezárolt napok, amelyekhez nem tartozik Booking.com foglalás.</p>
            <div className="space-y-2">
              {manualBlocks.map((b, i) => (
                <button key={i} onClick={() => navigateToDate(b.start)}
                  className="w-full flex items-center justify-between text-sm px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left">
                  <span className="text-gray-700">{formatDate(b.start)} – {formatDate(b.end)}</span>
                  <span className="text-gray-400 text-xs">Ugrás →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conflicts */}
        {data?.configured && conflictCount > 0 && (
          <div className="bg-white rounded-lg border border-red-400 p-4">
            <h2 className="font-medium text-red-700 mb-1">Dupla foglalás – azonnal ellenőrizd!</h2>
            <p className="text-xs text-gray-500 mb-3">Mindkét platformon foglalás érkezett ugyanazokra a napokra.</p>
            <div className="space-y-2">
              {data.conflicts?.map((c, i) => (
                <button key={i} onClick={() => navigateToDate(c.overlapStart)}
                  className="w-full text-left text-sm px-3 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium text-red-700">Átfedés: {formatDate(c.overlapStart)} – {formatDate(c.overlapEnd)}</span>
                    <span className="text-gray-400 text-xs">Ugrás →</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                    <div>
                      <div className="font-medium mb-0.5">Airbnb</div>
                      <div>Vendégfoglalás</div>
                      <div className="text-gray-400">{formatDate(c.airbnb.start)} – {formatDate(c.airbnb.end)}</div>
                    </div>
                    <div>
                      <div className="font-medium mb-0.5">Booking.com</div>
                      <div>Foglalás / zárás</div>
                      <div className="text-gray-400">{formatDate(c.booking.start)} – {formatDate(c.booking.end)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {showHistory && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-medium text-gray-800 mb-1">Korábbi foglalások</h2>
            <p className="text-xs text-gray-400 mb-3">Lezárult, múltbeli események – véglegesen megőrizve az iCal-ból való kikerülés után is.</p>
            {(!data?.history || data.history.length === 0) ? (
              <p className="text-sm text-gray-400">Még nincs rögzített előzmény.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {data.history.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm py-2 border-b border-gray-100">
                    <div>
                      <span className="font-medium">{h.source === "airbnb" ? "Airbnb" : "Booking.com"}</span>
                      <span className="text-gray-400 text-xs ml-2">{eventTypeLabel(h.eventType)}</span>
                      <div className="text-gray-500 text-xs mt-0.5">{formatDate(h.start)} – {formatDate(h.end)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Changelog */}
        {showChangelog && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-medium text-gray-800 mb-3">Változásnapló</h2>
            {(!data?.changelog || data.changelog.length === 0) ? (
              <p className="text-sm text-gray-400">Még nincs rögzített változás.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {data.changelog.map((entry, i) => (
                  <div key={i} className="flex gap-3 text-sm py-2 border-b border-gray-100">
                    <span className="text-gray-400 w-4 shrink-0">
                      {entry.type === "appeared" ? "+" : entry.type === "completed" ? "✓" : "−"}
                    </span>
                    <div>
                      <span className="font-medium">{entry.platform === "airbnb" ? "Airbnb" : "Booking.com"}</span>
                      <span className="text-gray-400 text-xs ml-2">{eventTypeLabel(entry.eventType)}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {entry.type === "appeared" ? "megjelent" : entry.type === "completed" ? "lezárult" : "eltűnt"}
                      </span>
                      <div className="text-gray-500 text-xs mt-0.5">{formatDate(entry.event.start)} – {formatDate(entry.event.end)}</div>
                      <div className="text-gray-300 text-xs">{new Date(entry.timestamp).toLocaleString("hu-HU")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Jelmagyarázat */}
        {data?.configured && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Jelmagyarázat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-2"><div className="w-8 h-4 rounded bg-red-200 border border-red-300"></div>Airbnb vendégfoglalás</div>
              <div className="flex items-center gap-2"><div className="w-8 h-4 rounded bg-blue-100 border border-blue-200"></div>Booking.com foglalás</div>
              <div className="flex items-center gap-2"><div className="w-8 h-4 rounded bg-gray-100 border border-gray-300"></div>Manuálisan zárolt (Airbnb)</div>
              <div className="flex items-center gap-2"><div className="w-8 h-4 rounded bg-amber-100 border border-amber-300"></div>Szinkron hiány – Booking.com zárva, Airbnb nyitva</div>
              <div className="flex items-center gap-2"><div className="w-8 h-4 rounded bg-red-500"></div>Dupla foglalás – azonnal ellenőrizd!</div>
            </div>
          </div>
        )}

        {/* Calendar */}
        {data?.configured && (
          <div id="calendar" className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <button onClick={prevMonth} className="px-2 py-1 hover:bg-gray-100 rounded text-gray-600">‹</button>
              <span className="font-medium text-gray-800">{MONTHS_HU[currentMonth]} {currentYear}</span>
              <button onClick={nextMonth} className="px-2 py-1 hover:bg-gray-100 rounded text-gray-600">›</button>
            </div>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS_HU.map(d => <div key={d} className="text-center text-xs text-gray-400 py-2">{d}</div>)}
            </div>
            {loading ? (
              <div className="text-center py-10 text-sm text-gray-400">Betöltés...</div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const hasAirbnb = !!day.airbnb;
                  const hasBooking = !!day.booking;
                  let bg = "";
                  if (!day.isCurrentMonth) bg = "bg-gray-50";
                  else if (day.isConflict) bg = "bg-red-500";
                  else if (day.isSyncGap) bg = "bg-amber-100";
                  else if (hasAirbnb && hasBooking) bg = "bg-purple-50";
                  else if (hasAirbnb) bg = day.airbnb!.eventType === "airbnb_guest" ? "bg-red-100" : day.airbnb!.eventType === "manual_block" ? "bg-gray-100" : "bg-red-50";
                  else if (hasBooking) bg = day.booking!.eventType === "booking_event" ? "bg-blue-100" : "bg-amber-100";

                  return (
                    <div key={i} onClick={() => day.isCurrentMonth && (hasAirbnb || hasBooking) && setSelectedDay(selectedDay?.date === day.date ? null : day)}
                      className={`min-h-[48px] p-1 border-b border-r border-gray-100 ${bg} ${day.isCurrentMonth && (hasAirbnb || hasBooking) ? "cursor-pointer hover:opacity-80" : ""} ${day.isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}>
                      <div className={`text-xs font-medium ${!day.isCurrentMonth ? "text-gray-300" : day.isConflict ? "text-white" : day.isToday ? "text-blue-600" : "text-gray-700"}`}>
                        {day.date.getDate()}
                      </div>
                      {day.isCurrentMonth && (
                        <div className="text-[9px] leading-tight mt-0.5">
                          {hasAirbnb && !day.isConflict && (
                            <div className={`${day.airbnb!.eventType === "manual_block" ? "text-gray-500" : "text-red-700"}`}>
                              {day.airbnb!.eventType === "airbnb_guest" ? "A · Vendég" : day.airbnb!.eventType === "manual_block" ? "A · Manuális" : "A"}
                            </div>
                          )}
                          {hasBooking && !day.isConflict && (
                            <div className={`${day.booking!.eventType === "sync_gap" ? "text-amber-700" : "text-blue-700"}`}>
                              {day.booking!.eventType === "booking_event" ? "B · Foglalt" : "B · Szinkron!"}
                            </div>
                          )}
                          {day.isConflict && <div className="text-white font-bold">⚠ Dupla</div>}
                          {day.isSyncGap && <div className="text-amber-700 font-medium">! Nyitva</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Selected day */}
        {selectedDay && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-800 mb-3">
              {selectedDay.date.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" })}
              {selectedDay.isConflict && <span className="ml-2 text-sm text-red-600 font-normal">– Dupla foglalás!</span>}
              {selectedDay.isSyncGap && <span className="ml-2 text-sm text-amber-600 font-normal">– Szinkron hiány</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Airbnb</p>
                <DayDetail booking={selectedDay.airbnb} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Booking.com</p>
                <DayDetail booking={selectedDay.booking} />
              </div>
            </div>
          </div>
        )}

        {/* Magyarázat */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 text-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Hogyan működik? — Korlátok és magyarázat</h2>

          <div>
            <p className="font-medium text-gray-700 mb-1">Airbnb naptár (iCal export)</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li><strong>Vendégfoglalás</strong> – valódi Airbnb vendég. Az iCal tartalmaz foglalási linket és a vendég telefonszámának utolsó 4 számjegyét.</li>
              <li><strong>Nem elérhető</strong> – vagy Booking.com-ból szinkronizált zárás, vagy manuálisan lezárolt nap. Az iCal-ban a kettő egyforma, csak keresztbe ellenőrzéssel különíthetők el.</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-gray-700 mb-1">Booking.com naptár (iCal export)</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li><strong>Zárolt nap (CLOSED)</strong> – Booking.com saját zárása: lehet valódi vendégfoglalás vagy manuális zárás. Az iCal nem különbözteti meg.</li>
              <li>A Booking.com <strong>nem exportálja</strong> az Airbnb-ből átvett szinkron blokkokat – ezért az Airbnb→Booking.com szinkron automatikusan nem ellenőrizhető.</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-gray-700 mb-1">Mit figyel az app?</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>✓ Dupla foglalás – Airbnb vendég és Booking.com zárás ugyanazon napokra</li>
              <li>✓ Szinkron hiány – Booking.com zárt, de Airbnb-n még lehet foglalni</li>
              <li>✓ Manuális zárások azonosítása – Airbnb-n van, Booking.com-on nincs párja</li>
              <li>✓ Változáskövetés – mikor jelent meg vagy tűnt el egy foglalás</li>
              <li>✓ Múltbeli foglalások megőrzése – lezárult események nem törlődnek</li>
              <li>✗ Airbnb→Booking.com szinkron ellenőrzése – technikailag nem lehetséges iCal alapon</li>
            </ul>
          </div>

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Az iCal szinkron 3–24 óra késéssel működik és csendben meghibásodhat. Automatikus ellenőrzés: naponta reggel 8-kor. Az app csak figyel, semmit sem módosít egyik platformon sem.
          </p>
        </div>

      </div>
    </div>
  );
}
