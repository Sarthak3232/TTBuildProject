# Working on SLOTTY

## Start your own page branch

Until the setup PR is merged, branch from the shared starter:

```sh
git fetch origin
git switch -c your-name/your-page origin/SarthakInitialSetup
npm ci
npm run dev
```

After setup is merged, use `origin/main` as the starting point instead. Submit your page's PR into `main` after the setup PR has merged.

## Page files

Each route has its own page file. The `(app)` directory is a Next.js route group and does not appear in the URL. Keep the exact `/tasks/runTracker` capitalization.

| Page | URL | File |
| --- | --- | --- |
| Dashboard | `/dashboard` | `web/src/app/(app)/dashboard/page.tsx` |
| Tasks | `/tasks` | `web/src/app/(app)/tasks/page.tsx` |
| Studbot | `/tasks/studbot` | `web/src/app/(app)/tasks/studbot/page.tsx` |
| Run / Walk Tracker | `/tasks/runTracker` | `web/src/app/(app)/tasks/runTracker/page.tsx` |
| History | `/history` | `web/src/app/(app)/history/page.tsx` |
| Redeem | `/redeem` | `web/src/app/(app)/redeem/page.tsx` |
| Profile | `/profile` | `web/src/app/(app)/profile/page.tsx` |

The shared shell is `web/src/app/(app)/layout.tsx`, navigation is `web/src/components/navigation/AppNavigation.tsx`, and base styles are `web/src/app/globals.css`. Coordinate changes to these files and the root dependency lockfile. Put page-specific UI in `web/src/features/<feature>/` when needed, and use CSS modules to keep page styles local. The `@/` import alias points to `web/src/`.

## Scope and checks

The starter contains placeholder pages and routing. It has no authentication or working activity/reward features yet. Do not put real user data in these public page shells; T010 must add the authentication boundary first.

Use the [Spec Kit task list](specs/001-task-reward-locker/tasks.md) to select work and follow its prerequisites. Name the relevant task IDs in each PR. Check a task only when its entire acceptance scope is complete; record partial progress without checking it. The initial setup's deliberately limited scope is recorded in [implementation evidence](specs/001-task-reward-locker/implementation-evidence.md).

Before opening a PR:

```sh
npm run check
```

Also check your page and its navigation at desktop and phone widths. Root scripts include `dev` / `dev:web`, `lint`, `typecheck`, `build`, and `start`. CI runs the same frontend checks. Full ML, Supabase, and feature-test tooling will be added by their assigned Spec Kit tasks.
