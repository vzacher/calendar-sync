# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run start    # Start production server
```

No test suite is configured.

## Architecture

This is a **Next.js 14 App Router** application deployed on Vercel. It monitors short-term rental bookings from Airbnb and Booking.com for double-booking conflicts and sends SMS alerts via Twilio.

### Data flow

1. `src/lib/ical.ts` — core logic: fetches and parses iCal feeds (manual regex parser, not `node-ical`, for edge compatibility), detects overlapping bookings via `findConflicts()`.
2. `src/app/api/calendar-data/route.ts` — GET endpoint called by the frontend; returns bookings for both platforms + conflicts for the next 6 months.
3. `src/app/api/check-conflicts/route.ts` — GET endpoint used by the Vercel cron job (runs hourly per `vercel.json`); if conflicts exist, sends an SMS alert via Twilio's REST API directly (no SDK).
4. `src/app/page.tsx` — client component: interactive calendar dashboard with month navigation, conflict highlighting, and a manual conflict-check button.

### Key details

- iCal parsing is done manually with regex (not `node-ical`) so it runs in Node.js runtime (`export const runtime = "nodejs"` on routes).
- Events with `summary === "Not available"` or `"Blocked"` are skipped — these are self-created blocks, not real bookings.
- iCal `DTEND` is exclusive (checkout day is free), reflected in `isDateInRange()`.
- The cron endpoint checks for the `x-vercel-cron: 1` header or a `Bearer ${CRON_SECRET}` header for auth.
- UI language is Hungarian throughout.

### Required environment variables

| Variable | Purpose |
|---|---|
| `AIRBNB_ICAL_URL` | Airbnb calendar export URL |
| `BOOKING_ICAL_URL` | Booking.com calendar export URL |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number |
| `ALERT_PHONE_NUMBER` | Recipient phone number for SMS alerts |
| `CRON_SECRET` | Optional secret for securing the cron endpoint |
