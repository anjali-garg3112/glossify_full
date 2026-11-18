# Glossify: design + backend implementation plan

## Decisions
- Brand direction: premium black + red, retaining the existing Glossify logo, hero imagery, responsive layout, showcase gallery, booking UI and footer.
- Business: one detailing studio. Do not show an outlet locator or invent a studio address/phone/pricing that the owner has not supplied.
- Booking workflow: customer signs up/logs in, chooses car segment, detailing service, appointment date/time and submits a request. New bookings start as `Pending`; the admin confirms or updates the status.
- Stack: static frontend on Netlify; Node.js + Express API on Render; MongoDB Atlas; separate admin dashboard.

## Phases
1. **Brand/UI** — preserve current Glossify identity; refine spacing, responsiveness, accessible form states and premium black/red accents. Keep reference-inspired information architecture without copying The Detailing Mafia's proprietary assets or exact copy.
2. **Customer authentication** — signup/login API; bcrypt password hashing; JWT authentication; never store plaintext passwords.
3. **Bookings** — validate all required fields on the server, persist records to MongoDB, return a booking reference, default to `Pending`.
4. **Admin** — admin-only API endpoints; separate dashboard; list bookings and change status to Pending, Confirmed, Completed or Cancelled.
5. **Deploy** — deploy API to Render, database to Atlas, frontend to Netlify; configure environment variables and CORS origins; smoke-test the full flow.
6. **Before production** — add password reset/email verification, email or SMS notifications, rate-limit tuning, backups, monitoring, privacy policy and secure HttpOnly-cookie auth if desired.

## Deployment checklist
- [ ] Create MongoDB Atlas cluster and database user.
- [ ] Set Render environment variables from `backend/.env.example` (never commit secrets).
- [ ] Deploy backend and verify `/api/health` returns `{ "ok": true }`.
- [ ] Update `api-config.js` to the real backend URL.
- [ ] Set `CLIENT_ORIGIN` to the exact deployed frontend origin(s).
- [ ] Deploy the website root folder to Netlify.
- [ ] Deploy `admin/index.html` as a separate site or `/admin/` path and configure its API URL as described in `README-SETUP.md`.
- [ ] Test signup, login, booking submission, admin login and booking status update.
- [ ] Test invalid dates, invalid fields, non-admin access and mobile layout.

## Important status
This ZIP contains implementation code and setup instructions, not a connected live deployment. Live persistence starts only after the owner configures Atlas, Render and Netlify and supplies the deployed API URL.
