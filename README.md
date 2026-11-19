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

Configure Google Identity Services for the staff sign-in. Create an OAuth 2.0 Client ID of type Web application in Google Cloud Console. Add the production Pages origin and each preview origin you intend to use under Authorized JavaScript origins. Set the build-time variable `VITE_GOOGLE_CLIENT_ID` to that client ID in Cloudflare Pages (Production and Preview environments). Also set the Pages secret `GOOGLE_CLIENT_ID` to the same value for server-side audience verification. Keep `ORDER_ADMIN_EMAILS` as the comma-separated allowlist; the code also permits the owner and Nikka's approved accounts. Google ID tokens are verified server-side with Google's tokeninfo endpoint, including audience, verified email, and expiry checks. The API then stores only hashed session tokens in D1 and sets an HttpOnly, Secure, SameSite=Lax session cookie. Sessions expire after 12 hours. Remove the old `STAFF_DASHBOARD_PASSWORD` secret after Google sign-in has been tested.

The staff dashboard route is `/staff`. The API checks the session and allowlist for every staff endpoint; do not rely on hiding the route as security.

## D1
The D1 schema is documented in `migrations/0001_initial.sql`. The existing D1 database was already initialized in the Cloudflare dashboard; do not run destructive migrations.

## Current status
The original source archive, React frontend adaptation, Cloudflare Pages Function bridge, D1 API, menu image assets, and Daily/Weekly/Monthly sales period selector have been added. This repository is not yet deployed or production-verified. The Pages D1 binding, Google OAuth client configuration, environment variables, deployment, and end-to-end tests must be completed and verified.
