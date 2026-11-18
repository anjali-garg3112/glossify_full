# Glossify — live MongoDB + admin dashboard

This ZIP contains the existing responsive Glossify website plus a Node.js/Express backend and a separate admin dashboard. The customer authentication has been changed from browser-only demo storage to backend authentication. Customer accounts and bookings are stored in MongoDB Atlas. The admin dashboard receives live changes using MongoDB Change Streams over Server-Sent Events.

## What is implemented

- Customer signup/login backed by MongoDB; passwords are bcrypt-hashed.
- Customer records include name, email and phone number.
- Authenticated booking creation and customer booking history.
- Admin-only overview, customer directory, booking list and booking status updates.
- Live admin refresh when a customer signs up, a booking is created, or a booking status changes.
- API rate limits, CORS allow-list, Helmet headers and server-side validation.

**Important:** This is deployable application code, not a live connected service yet. No database or hosting credentials were supplied in this conversation. It will not receive real customer data until you create/configure MongoDB Atlas, deploy the backend, and set the deployed API URL in `api-config.js`.

## 1. MongoDB Atlas

1. Create a MongoDB Atlas account/project and create a cluster (a shared/free cluster is sufficient to begin).
2. Create a database user with a strong unique password.
3. In Network Access, allow connections from the backend host. For initial testing Atlas may permit `0.0.0.0/0`; restrict access when your hosting egress IP/range is known.
4. Copy the Node.js connection string. Replace the username/password placeholders and use database name `glossify`.
5. Keep this connection string private. Never put it in frontend files or commit it to GitHub.

MongoDB Change Streams require a replica-set deployment; Atlas clusters provide this. The admin live feed uses Change Streams, not periodic page refresh.

## 2. Deploy backend to Render

1. Push this project to a private GitHub repository.
2. In Render, create a **Web Service** for the repository and set **Root Directory** to `backend`.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add these environment variables in Render (do not create a public `.env` file):
   - `MONGODB_URI` — your Atlas connection string
   - `JWT_SECRET` — a long random secret (at least 32 random bytes)
   - `ADMIN_NAME` — e.g. `Glossify Admin`
   - `ADMIN_EMAIL` — the email you will use to sign in to the admin dashboard
   - `ADMIN_PASSWORD` — a strong unique admin password
   - `CLIENT_ORIGIN` — exact website origin, e.g. `https://glossifycar.com`; comma-separate additional origins such as `https://www.glossifycar.com`
6. Deploy and test `https://YOUR-BACKEND.onrender.com/api/health`. It should return `ok: true` and `database: connected`.

The configured admin account is created/promoted when the backend starts. Keep the credentials private. The admin password is not displayed in the frontend.

## 3. Connect and deploy website

1. Open `api-config.js` and replace the placeholder with your real Render URL, for example:
   `window.GLOSSIFY_API_BASE = 'https://your-glossify-api.onrender.com';`
2. Deploy the contents of the ZIP root folder (not the enclosing folder) to your existing Netlify site.
3. Ensure the exact Netlify custom-domain origin is included in Render's `CLIENT_ORIGIN`.

## 4. Deploy admin dashboard

You can host the `admin` folder as a separate Netlify site or place `admin/index.html` under `/admin/` on the main website. For a separate site, add this before the dashboard's inline script (replace with your Render URL):

`<script>window.GLOSSIFY_API_BASE = 'https://your-glossify-api.onrender.com';</script>`

Sign in using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in Render. The dashboard includes customer count, booking totals, pending/confirmed/completed counts, booking status controls and a customer directory.

## API routes

- `POST /api/auth/signup` — create customer account
- `POST /api/auth/login` — customer/admin login
- `GET /api/auth/me` — current authenticated account
- `POST /api/bookings` — create booking
- `GET /api/bookings/mine` — customer's bookings
- `GET /api/admin/overview` — admin metrics
- `GET /api/admin/customers` — admin customer directory
- `GET /api/admin/bookings` — admin booking list
- `PATCH /api/admin/bookings/:id/status` — update booking status
- `GET /api/admin/events` — admin-only live event stream (MongoDB Change Streams)
- `GET /api/health` — API/database health

## Before relying on it for a live business

- Add email/OTP verification and password reset.
- Configure automated Atlas backups and monitoring.
- Add a privacy policy and consent/retention process for customer data.
- Add payment provider integration and pricing before reporting actual revenue. Revenue is intentionally not fabricated in this version.
- For higher-security sessions, migrate browser localStorage JWT storage to secure HttpOnly cookies with CSRF protection. The admin EventSource currently passes its short-lived JWT in the stream URL because native EventSource cannot set an Authorization header; ensure hosting/proxy access logs do not retain query strings, or migrate to a fetch-based streaming client.
- Test the full flow after deployment: customer signup, login, booking, admin login, live booking arrival, customer listing and status change.
