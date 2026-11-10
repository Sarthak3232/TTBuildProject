# Isolated tracking browser tests

This host renders the production `AppProvider`, `ActivityPreview`, GPS hook and `RouteMap` in Vite. It is included only in Playwright's development web servers and is not a Next app route or an authentication bypass. No real user, Supabase project, credentials or location are used.

Playwright intercepts `/api/**` with explicit fixture responses and replaces browser geolocation with controlled callbacks. The map provider constructor deliberately fails so the real production map-error fallback is exercised. `next/link` is an anchor shim because the host has no Next router. Application state, timers, controls, client requests, cursor restoration, GPS lifecycle and saved-summary rendering use the production components.

The shared Playwright config starts `node tests/e2e/tracking-harness/server.mjs` on `127.0.0.1:3101` when this harness exists. Run `npm run test:e2e --workspace @slotty/web -- tracking.spec.ts` from the repository root. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an already installed compatible Chromium executable when needed. No browser is downloaded by this harness.

The four cases run for desktop and mobile Chromium: run start/GPS/pause/resume/finish using shared PATCH contracts, walking timer/route restoration after reload, denied location with a continuing server-backed clock, and an owner-read saved summary/route surviving a map failure without mutation controls. API fixtures test browser integration, not database authorization; real PostgreSQL/RLS/transaction tests remain in `supabase/tests/tracking_validation.sql` and the shared application/concurrency suites.
