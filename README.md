# OBA Core

OBA Core is a SvelteKit operating system for outdoor/adventure businesses: bookings, clients, sessions, services, staff, inventory, WhatsApp intake foundations, and modular service workflows.

Tipiti Surf School is the first real customer/proving ground, but the codebase should stay generic enough for other outdoor operators.

## Stack

- SvelteKit + Svelte 5
- TypeScript
- PostgreSQL
- Drizzle ORM
- Better Auth
- Paraglide/Inlang i18n (`es`, `en`)
- Vitest + Playwright
- pnpm via Corepack

## Local setup

```sh
corepack enable
corepack pnpm install
cp .env.example .env
```

Start Postgres:

```sh
corepack pnpm db:start
```

Then edit `.env` if needed and push the schema:

```sh
corepack pnpm db:push
corepack pnpm db:seed
```

Start the app:

```sh
corepack pnpm dev
```

## Environment variables

Required for running the real app, migrations, seeds, and DB-backed integration tests:

```sh
DATABASE_URL=postgresql://root:change-me-db-password@localhost:5432/local
BETTER_AUTH_SECRET=change-me-to-a-random-32-char-string
BETTER_AUTH_URL=http://localhost:5173
ORIGIN=http://localhost:5173
INTERNAL_API_KEY=change-me-to-a-random-32-char-string
PUBLIC_BUSINESS_NAME=My Surf School
```

Seed owner variables are optional unless you run the seed script.

## i18n / generated files

Paraglide output lives under `src/lib/paraglide` and is generated from the Inlang project.

Run manually when needed:

```sh
corepack pnpm i18n:compile
```

The main scripts compile i18n first, so a fresh clone can run checks/builds without manually remembering this step.

## Quality gates

```sh
corepack pnpm check
corepack pnpm test:unit
corepack pnpm build
```

Notes:

- `check` currently passes with warnings.
- DB integration tests are skipped when `DATABASE_URL` is not set.
- `build` is allowed to run without production secrets; build-time auth config uses safe placeholders only while SvelteKit is building.
- Runtime/database actions still require the real `.env` values.

For browser/component and full E2E tests:

```sh
corepack pnpm exec playwright install
corepack pnpm test:browser -- --run
corepack pnpm test:e2e
```

## Database commands

```sh
corepack pnpm db:start      # docker compose up
corepack pnpm db:push       # drizzle-kit push
corepack pnpm db:generate   # drizzle-kit generate
corepack pnpm db:migrate    # drizzle-kit migrate
corepack pnpm db:studio     # drizzle-kit studio
```

## Development model

Do baseline fixes and product changes in branches, then open PRs against `main`.

This repository should be clonable and checkable without access to Dave's Mac or production VPS. Machine-specific secrets stay in `.env` and are not committed.
