# Club Operations

Live management for billiards, snooker, PlayStation sessions, cafeteria orders, payments, and revenue.

## Run & Operate

- `python django_backend/manage.py runserver 0.0.0.0:$PORT --noreload` — run the Django API server
- `pnpm --filter @workspace/club-operations run dev` — run the React dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `python django_backend/manage.py migrate` — apply Django schema changes
- `python django_backend/manage.py seed_demo` — add the eight club resources and starter cafeteria products
- Required env: `DATABASE_URL` for PostgreSQL; local development falls back to SQLite

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Django 5 REST-style JSON endpoints
- DB: PostgreSQL via Django ORM (SQLite fallback for local development)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `django_backend/club/` — Django models, JSON views, URLs, migrations, and demo seed
- `lib/api-spec/openapi.yaml` — API contract and source of truth for generated React hooks
- `artifacts/club-operations/` — React dashboard

## Architecture decisions

- Session totals are calculated server-side from elapsed time and the resource hourly rate.
- Every order line stores the sale price at checkout so historical revenue does not change when a product price changes.
- Limited sessions become overdue without being auto-closed, so staff can decide whether to extend or stop and settle them.
- Cash and CliQ are explicit payment methods on completed sales and reports aggregate only settled transactions.

## Product

The app gives club staff a live view of all eight playing resources, starts open or limited sessions, alerts on overdue time, records cafeteria sales, takes cash or CliQ payments, and reports revenue by day and payment method.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
