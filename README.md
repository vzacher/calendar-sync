# Naptár Szinkron – Airbnb & Booking.com dupla foglalás figyelő

## Miről szól?

Szálláshely-tulajdonosok számára készült eszköz, amely figyeli az Airbnb és Booking.com naptárakat, és azonnal jelez, ha dupla foglalás vagy szinkronizálási probléma keletkezik.

## Funkciók

- Dupla foglalás detektálása (mindkét platformon foglalt ugyanaz a nap)
- Szinkron hiány jelzése (Booking.com zárt, Airbnb még nyitva)
- Manuális zárások azonosítása
- Változáskövetés (mikor jelent meg / tűnt el egy foglalás)
- Múltbeli foglalások megőrzése (az iCal-ból kikerülő régi foglalások sem törlődnek)
- Naponta automatikus ellenőrzés (Vercel Cron)
- SMS értesítés dupla foglalás esetén (Twilio)

## Hogyan működik?

### Airbnb iCal export

Az Airbnb kétféle eseményt exportál:
- **Reserved** – valódi Airbnb vendégfoglalás, tartalmaz foglalási linket és a vendég telefonszámának utolsó 4 számjegyét
- **Airbnb (Not available)** – Booking.com-ból szinkronizált zárás VAGY manuálisan lezárolt nap. **A kettő az iCal-ban megkülönbözhetetlen** – csak keresztbe ellenőrzéssel (ha ugyanaz a dátum megjelenik a Booking.com iCal-ban is) azonosítható a forrás.

### Booking.com iCal export

A Booking.com egyféle eseményt exportál:
- **CLOSED – Not available** – Booking.com saját zárása: lehet valódi vendégfoglalás vagy manuális zárás, az iCal nem különbözteti meg.

**Kritikus korlát:** A Booking.com **nem exportálja** az Airbnb-ből átvett szinkron blokkokat az iCal-ba. Ez azt jelenti, hogy az Airbnb→Booking.com szinkron iCal alapon nem ellenőrizhető automatikusan. Ha az Airbnb Airbnb lefoglal egy napot és azt átszinkronizálja Booking.com-ra, az a Booking.com iCal exportban nem jelenik meg.

### Keresztbe ellenőrzés logikája

| Airbnb esemény | Booking.com esemény | Értelmezés |
|---|---|---|
| Reserved | – | Airbnb vendégfoglalás (Booking szinkron nem ellenőrizhető) |
| Not available | CLOSED (egyező dátum) | Booking.com foglalás, mindkét oldalon megjelent |
| Not available | – | Manuális zárás Airbnb-n (nincs Booking.com forrása) |
| – | CLOSED | **Szinkron hiány** – Booking.com zárt, Airbnb nyitva! |
| Reserved | CLOSED (egyező dátum) | **Dupla foglalás** – mindkét platformon aktív foglalás! |

### Miért csak így működik?

Az iCal egy egyszerű, csak lekérdezhető (pull-based) naptárformátum. Sem az Airbnb, sem a Booking.com nem biztosít ingyenes, valós idejű push API-t szálláshely-tulajdonosok számára. A Booking.com Connectivity API csak akkreditált channel managereknek (pl. Hostaway, Guesty) érhető el.

Az iCal szinkron jellemző korlátai:
- **3–24 óra késés** az Airbnb és Booking.com közötti szinkronizálásban
- **Csendben meghibásodhat** – nincs hibaüzenet, ha a szinkron leáll
- **Irányonként aszimmetrikus** – Airbnb mutatja a Booking.com blokkokat, Booking.com nem mutatja az Airbnb blokkokat

## Telepítés és konfiguráció

### Előfeltételek
- Vercel fiók (ingyenes Hobby plan elegendő)
- Upstash Redis adatbázis (ingyenes tier elegendő)
- Twilio fiók SMS értesítéshez (opcionális)

### Környezeti változók

| Változó | Leírás |
|---|---|
| `AIRBNB_ICAL_URL` | Airbnb naptár export URL (Naptár → Export) |
| `BOOKING_ICAL_URL` | Booking.com naptár export URL (Extranet → Naptár → Szinkronizálás) |
| `KV_REST_API_URL` | Upstash Redis URL (automatikusan beállítja a Vercel integráció) |
| `KV_REST_API_TOKEN` | Upstash Redis token (automatikusan beállítja a Vercel integráció) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (opcionális) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (opcionális) |
| `TWILIO_FROM_NUMBER` | Twilio küldő telefonszám, pl. `+1234567890` (opcionális) |
| `ALERT_PHONE_NUMBER` | Értesítési telefonszám, pl. `+36201234567` (opcionális) |
| `CRON_SECRET` | Opcionális titkos kulcs a cron végpont védelméhez |

### Deploy

1. Fork-old vagy klónozd a repót
2. Hozz létre egy Vercel projektet és kapcsold össze a GitHub repóval
3. A Vercel Storage menüben hozz létre egy Upstash for Redis adatbázist (Frankfurt régió ajánlott)
4. Állítsd be a környezeti változókat
5. Deploy

## Technikai stack

- **Next.js 14** (App Router)
- **Upstash Redis** – foglalási snapshot és változásnapló tárolása
- **Twilio** – SMS értesítés (opcionális)
- **Vercel Cron** – napi automatikus ellenőrzés (Hobby plan: 1x/nap)
- **iCal parsing** – külső library nélkül, regex alapú parser (edge kompatibilis)

## API végpontok

| Végpont | Leírás |
|---|---|
| `GET /api/calendar-data` | Mindkét naptár adatai, konfliktusok, változásnapló, előzmények |
| `GET /api/check-conflicts` | Ellenőrzés futtatása, Redis frissítése, SMS küldés |

A `/api/check-conflicts` végpontot a Vercel Cron naponta 8:00-kor hívja. Manuálisan is futtatható az app felületéről, vagy `Authorization: Bearer <CRON_SECRET>` headerrel.
