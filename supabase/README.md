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

All ten application tables have RLS. Signed-in users can read their own records. Idempotency records are internal to the database. Users can edit their own profiles and custom tasks, and use the session RPC to edit goals. They cannot directly change balances, sessions, completion history, earning entries or calculated goal progress. Anonymous roles have no app-table access. Private trigger helpers cannot be invoked as browser RPCs.

The application migrations add activity accounting, goals and history projections, virtual rolls and private GPS routes. The `authenticated_app_sessions` migration adds authenticated RPCs that derive ownership from `auth.uid()`. The existing accounting functions remain restricted to trusted database roles. Roll randomness is generated inside Postgres and browser-role grants limit direct access to private records.

## Migrations and validation

Apply the SQL files in `migrations/` in filename order to a fresh database. For a hosted database, check `supabase_migrations.schema_migrations` and apply only pending versions.

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

Review successful output before replacing `web/src/server/supabase/database.types.ts`. `web/.env.example` lists the settings the application needs. Hosted database administration uses separate credentials.

The committed types cover the `public` and Supabase-managed `graphql_public` schemas.

## Isolated application database checks

For a fresh native/CI PostgreSQL 17 database with contrib extensions, run `python3 scripts/test-postgres.py postgresql://postgres@127.0.0.1:55432/slotty_test`. The target must be empty and loopback with a `slotty_test*` name. It creates only test Auth catalog/roles, applies all committed migrations and runs rollback security/accounting/GPS fixtures plus real concurrent start/complete/spend checks. It never resets or targets hosted data and does not test Auth HTTP/email issuance. CI runs this same path against a disposable Postgres service.

`python3 scripts/generate-public-types.py DATABASE_URL` regenerates public table/FK/RPC types via read-only catalog queries when the full CLI generator is unavailable. Preserve the separately exported managed GraphQL schema; record local/hosted parity separately. See current implementation evidence for commands, results and unperformed hosted/device checks.
