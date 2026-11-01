# Initial frontend setup evidence

Date: 2026-11-01. Branch: `SarthakInitialSetup`. [Issue #1](https://github.com/Sarthak3232/TTBuildProject/issues/1).

## Scope and task status

The user requested a minimal shared frontend so teammates can build pages independently, with five sidebar destinations and nested Studbot/run-tracker routes. The issue-linked branch starts from `main` and carries the existing Spec Kit files from `task-reward-spec`, preserving the main README's SLOTTY branding.

T001 is complete. T005 (frontend scripts), T006 (shared layout/styles), and T017 (routing/navigation) are partial and remain unchecked. Other tasks remain pending. The user explicitly authorized the routing shell ahead of T010 and the full foundation gate. Only public placeholders exist; no real user data, session earning, rolling, sensors, ML, backend, or hardware behavior is implemented. Auth requirements still apply before private feature work ships.

## Implemented routes

| Route | Current behavior |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/dashboard` | Dashboard placeholder. |
| `/tasks` | Tasks placeholder with links to the two activity pages. |
| `/tasks/studbot` | Studbot placeholder with a back-to-Tasks link. |
| `/tasks/runTracker` | Run/walk placeholder with a back-to-Tasks link. Capitalization preserved. |
| `/history` | History placeholder. |
| `/redeem` | Redeem placeholder. |
| `/profile` | Profile placeholder. |

The sidebar has exactly five links. Tasks remains active on both nested routes. Each page has its own file under `web/src/app/(app)/`; navigation and layout are shared. Page ownership and branch instructions are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Validation

Environment: macOS, Node 22.20.0, npm 10.9.3, Next.js 16.4.3, React 19.3.1, TypeScript 5.9.3.

| Check | Result |
| --- | --- |
| Spec Kit prerequisites and requirements checklist | PASS; feature resolved, 15/15 checklist items already checked. Reviewer checklist markers were not edited. |
| `npm ci` and `npm run dev` | PASS; clean lockfile install and development server start without credentials; nested run-tracker route returns 200. |
| `npm run lint` | PASS; zero warnings. |
| `npm run typecheck` | PASS; generated route types and strict TypeScript check. |
| `npm run build` | PASS; all seven page routes prerendered. |
| Production HTTP smoke checks | PASS; seven pages return 200, root returns 307 to Dashboard, unknown path returns 404, exactly five sidebar links and correct active section per page. |
| Browser navigation | PASS; all sidebar destinations and both activity links, back-to-Tasks links, nested-route refresh, browser back/forward, current-page indicators, and visible keyboard focus. |
| Visual checks | PASS; neutral sidebar and readable placeholders at desktop and narrow phone viewport sizes, with no horizontal overflow on Tasks. |
| `npm audit --omit=dev` | PASS; zero production dependency advisories. |

The full dependency audit reports 16 moderate development-tool findings propagated from the single minimatch advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). These are in ESLint's dependency tree; no production dependencies are affected. ESLint 9 is pinned to match the current React/JSX accessibility plugins' peer ranges. Do not use `npm audit fix --force`, which proposes incompatible package downgrades; adopt compatible upstream fixes when available.

The full-system acceptance checks in [quickstart.md](quickstart.md) have not been run and are not claimed. Phase 1 and the foundation gate remain incomplete. There are no before/after implementation hooks configured.
