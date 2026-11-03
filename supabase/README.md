# Supabase database setup

The live database is **TTBuildProject** in Supabase:

- [Tables](https://supabase.com/dashboard/project/yruyulqwyalxmtseaoml/editor)
- [Authentication](https://supabase.com/dashboard/project/yruyulqwyalxmtseaoml/auth/users)
- [Migration history](https://supabase.com/dashboard/project/yruyulqwyalxmtseaoml/database/migrations)

Project reference: `yruyulqwyalxmtseaoml`. This identifier and the project URL are public configuration, not secret keys.

## What is implemented

| Table | Stores |
| --- | --- |
| `profiles` | Display name, IANA timezone and Auth user ID. |
| `tokenBalance` | One whole-token balance per user, initially zero, and a version. SQL uses `public."tokenBalance"` to preserve the name. |
| `task_definitions` | Seeded study/run/walk kinds and custom tasks. Every custom task requires a minimum of at least 30 minutes and may have one reflection question. |
| `activity_sessions` | Owner, captured task configuration, state, revision and timing fields. |
| `session_intervals` | Non-overlapping session intervals and eligibility. |
| `completions` | Immutable History snapshots, duration, reflection, optional distance and recorded award. |
| `token_entries` | Immutable earning entries, unique per completion. |
| `idempotency_records` | Server-only request keys and saved results for later retry handling. |
| `goal_schedules` | Positive duration targets for today, every day or selected weekdays. |
| `goal_occurrences` | One occurrence per schedule/date, with historical target/timezone and stored progress. |

Supabase manages `auth.users` and credentials. An Auth insert provisions the profile, zero balance and three predefined task kinds. Existing accounts are backfilled during the identity migration.

All ten application tables have RLS. Signed-in users can read their own records except server-only idempotency data. They can edit their profile preferences, create/edit their own custom tasks, and create/edit their goal schedules. They cannot directly change balances, sessions, completion history, earning entries or calculated goal progress. Anonymous roles have no app-table access. Private trigger helpers cannot be invoked as browser RPCs.

**This is schema setup only.** The Next.js pages do not connect to Supabase yet. Login/signup UI, session controls, atomic token crediting, goal expansion/progress, ML/GPS storage and application APIs remain later tasks. Storing a completion does not automatically credit a balance. Redemption, spending, drawers and delivery tables are deferred until the hardware is ready.

## Migrations and validation

Apply the SQL files in `migrations/` in filename order to a fresh database. The hosted project already has them applied and recorded in `supabase_migrations.schema_migrations`. Do not rerun the creation SQL there or edit an applied migration; create a new migration for further changes.

The hosted setup was applied through the signed-in Supabase SQL Editor in transactions. Migration history records the exact file contents, with source checksums verified against this checkout. No database password or API key is stored in Git. A CLI login/link is separate from signing in to the dashboard; it has not been configured by this setup.

Run `tests/schema_validation.sql` as `postgres` in Supabase's SQL Editor to check the schema. It creates two temporary fixture accounts inside one transaction, verifies provisioning/ownership/constraints and rolls back all fixtures. It does not reset tables or leave login-capable test accounts behind. This validates database behavior; it does not test signup emails, browser cookies or application endpoints.

## Optional local verification

The deployed database remains in Supabase. `config.toml` and these helpers let a developer reproduce the schema separately on their laptop with Docker:

```sh
npm ci
npm run supabase:start
npm run db:migrate
npm run db:check
npm run db:types
npm run supabase:stop
```

The helpers explicitly select `--local` for database actions, accept no target overrides, and never reset a database. `db:types` writes the generated schema artifact only after a successful response. The local stack has not been started as part of the hosted setup.

To regenerate types from the hosted project, use the dashboard's schema type export or authenticate the pinned CLI first:

```sh
npx --no-install supabase gen types --lang typescript --project-id yruyulqwyalxmtseaoml --schema public,graphql_public > /tmp/slotty-database.types.ts
```

Review successful output before replacing `web/src/server/supabase/database.types.ts`. `web/.env.example` reserves the future client/server variable names; the current page shell does not need them. Keep secret keys server-only and never commit populated environment files.

The committed types were generated and downloaded from the hosted project's Data API docs (Tables and Views → Introduction → Generate and download types). They include the configured `public` and Supabase-managed `graphql_public` schemas. They are not imported into application code yet.
