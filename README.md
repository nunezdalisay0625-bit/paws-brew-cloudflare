# Paws & Brew Online Menu — Cloudflare Migration

## Source of truth
The original AppDeploy source snapshot is preserved in `legacy-appdeploy/`. The production frontend is being adapted from that source; do not use the separate Lovable project as a reference.

## Current architecture
- Frontend: React + Vite, Cloudflare Pages output: `dist/`
- API: Cloudflare Pages Function at `functions/api/[[path]].js`, reusing `worker/index.js`
- Database: Cloudflare D1 database `paws-brew-db`, binding name `DB`
- Business timezone: Asia/Manila
- Currency: PHP

## Deploy with Cloudflare Pages
Connect this GitHub repository to Cloudflare Pages:
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Node.js version: 22

After creating the Pages project, add a D1 binding under Settings → Functions → D1 database bindings:
- Variable name: `DB`
- Database: `paws-brew-db`

Add an environment variable `ORDER_ADMIN_EMAILS` containing the comma-separated email addresses allowed to use the staff dashboard. The code also permits `nikka.lizardo@gmail.com`.

Protect the staff dashboard with Cloudflare Zero Trust Access; do not expose staff endpoints publicly. Create a Self-hosted Access application for the Pages hostname `paws-brew-cloudflare.pages.dev` covering both `/staff*` and `/api/staff/*`. Add an Allow policy for the approved staff email addresses (including `nunezdalisay0625@gmail.com` and `nikka.lizardo@gmail.com`). The app reads the authenticated identity from Cloudflare's `CF-Access-Authenticated-User-Email` request header and checks it against `ORDER_ADMIN_EMAILS` (the code also permits `nikka.lizardo@gmail.com`).

The staff dashboard route is `/staff`. Customer-facing routes and public order/payment APIs remain outside the Access path rules. The staff APIs independently reject requests without an Access identity and an approved email. The previous `STAFF_DASHBOARD_PASSWORD` secret is no longer used by this version and can be removed after the Access-protected dashboard is confirmed working.

## D1
The D1 schema is documented in `migrations/0001_initial.sql`. The existing D1 database was already initialized in the Cloudflare dashboard; do not run destructive migrations.

## Current status
The original source archive, React frontend adaptation, Cloudflare Pages Function bridge, D1 API, menu image assets, and Daily/Weekly/Monthly sales period selector have been added. This repository is not yet deployed or production-verified. The Pages D1 binding, Access policy, environment variables, deployment, and end-to-end tests remain.
