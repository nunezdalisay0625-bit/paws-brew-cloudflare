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


## Staff phone push notifications
The staff dashboard can register each authorized staff phone for browser push alerts. New online orders and table reservation requests trigger a notification to all registered staff devices, even when the dashboard is not open.

Configure these three Cloudflare Pages **Production secrets** (Settings → Variables and secrets → Add):
- `VAPID_PUBLIC_KEY`: URL-safe Base64 VAPID public key
- `VAPID_PRIVATE_KEY`: matching URL-safe Base64 private key; keep this secret
- `VAPID_SUBJECT`: a contact URI such as `mailto:nunezdalisay0625@gmail.com`

Use one stable VAPID key pair for the lifetime of the push subscriptions. Changing the pair later requires each phone to subscribe again. Do not commit the private key to GitHub.

After deploying the feature, each staff member must:
1. Open `https://paws-brew-cloudflare.pages.dev/staff` in Chrome on their phone and sign in with their authorized Google account.
2. Tap **Enable notifications** and allow notifications when the browser asks.
3. Keep site notifications enabled in the phone/browser settings.

On Android, Chrome supports push notifications from the installed browser site. On iPhone/iPad, web push requires iOS/iPadOS 16.4 or later and the site must be added to the Home Screen before permission can be requested. Each phone must complete setup separately.

The backend stores push subscriptions in a separate `paws_brew_push_subscriptions` D1 table created on demand. Existing order, reservation, and staff-session rows are not modified by subscription setup. Expired push endpoints (HTTP 404/410) are automatically removed.
