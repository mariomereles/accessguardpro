# Changelog

All notable changes to AccessGuard Pro will be documented in this file.

## [Unreleased]

### Admin UI
- New **Users** page (administrators create ORGANIZER/STAFF/ADMIN accounts, suspend and reactivate them) and **Organizations** page (platform administrators).
- **Events** page rewritten: create events, end/cancel/reopen them, remove attendees' personal data after the event; it now shows the real fields (it read non-existent ones before). **Activity** page fixed the same way.
- Organizers reach the admin area; the sidebar only shows what the signed-in role can use.

- **Attendees** page now works: pick an event, search by name or email, paginate, see Registered/Entered/Revoked status and revoke tickets (`GET /api/events/:id/attendees`, managers of the event's organization only; phone and document number are never returned).

### Enterprise
- Multi-tenancy: `organizations`; ORGANIZER/STAFF users and events belong to one, platform administrators (ADMIN without organization) see all. Every event/gate/attendee endpoint, the check-in and the real-time channel enforce the tenant boundary (404 for other tenants' ids).
- User administration API: `POST/GET /api/users`, `PATCH /api/users/:id/status` (suspending ends sessions at once), `POST/GET /api/orgs`. Organizers now reach the admin area.
- Sessions: refresh tokens are stored server-side, single use and rotated; reuse of a retired token revokes the whole session; `POST /api/auth/logout`.
- Versioned SQL migrations (`npm run db:migrate`, idempotent baseline that also upgrades databases created with `drizzle-kit push`) replace `push --force` in the build.
- Production refuses to start without valid `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (escape hatch: `ALLOW_EPHEMERAL_JWT_KEYS=true`).
- Observability: `/health` checks the database, `/metrics` (Prometheus, enabled with `METRICS_TOKEN`), one JSON log line per request in production.
- Data retention: `POST /api/events/:id/anonymize` replaces attendee personal data after an event ends (audited).


### Anti-fraud
- Rotating ticket QR: `AG1.<jti>.<30 s window>.<HMAC>` derived on the attendee's device from a per-ticket secret; screenshots stop working within ~90 s. Legacy static QR codes are rejected for tickets that have a secret. Codes are 57 chars (easy to scan).
- Fraud signals with real-time alerts and a dashboard panel: ticket reused at another gate, repeated reuse, bursts of rejected scans from one account.
- Hash-chained audit log (`audit_logs.prev_hash/hash`) with `GET /api/audit/verify`; logins, registrations, event/gate changes, exports, revocations and denials are audited.
- Ticket revocation (`POST /api/attendees/:id/revoke`) and event kill-switch (`PATCH /api/events/:id/status`).
- Gates can restrict ticket types (`allowedTicketTypes`); duplicate identities (same document, `+alias` emails) are rejected.
- Dashboard chart now shows real entries per gate (`GET /api/events/:id/timeseries`) instead of sample data.


### Security
- Public registration no longer accepts a `role`; it always creates a `USER`.
- `.env` removed from version control (rotate any credential that was ever committed).
- `/api/checkins`, `/api/gates`, `/api/gates/:id/qr`, metrics and event data endpoints now require authentication and a staff role.
- Socket.IO requires a valid access token from STAFF/ORGANIZER/ADMIN; real-time payloads no longer include personal data.
- Check-in is single-use per ticket (partial unique index `checkins_one_ok_per_attendee`), validates event/gate/ticket consistency, gate state, event status and capacity, and records denied attempts (`checkins` + `audit_logs`).
- Access, refresh and ticket tokens are distinct types; refresh tokens are no longer accepted as access tokens; suspended users cannot log in or refresh.
- Rate limiting, `helmet`, request size limit, same-origin CORS by default, `trust proxy` in production, generic 500 errors, CSV formula-injection escaping, response bodies no longer logged.
- `GATE_HS_SECRET_DEFAULT` is mandatory in production.

### Fixed
- Ticket QR codes no longer expire 24 h after registration.
- Client renews the access token with the refresh token; session survives page reloads.
- `POST /api/events` and `POST /api/gates` work with JSON payloads.
- Demo credentials removed from the login screen; STAFF/USER users are routed to their own pages.

## [1.1.0] - 2025-10-11

### Added
- **Gate Capacity Management System**
  - Three capacity types: `limited`, `unlimited`, and `unmeasured`
  - Numeric capacity limits for controlled access gates
  - Database schema migration with new `capacity_type` enum and `capacity` field
  - UI components for capacity selection in Admin Gates dashboard
  
- **UI/UX Improvements**
  - Enhanced dark theme contrast for better readability
  - Theme-aware color system for cards and statistics
  - Improved visual hierarchy with backdrop blur effects
  - Better border contrast for card components

### Changed
- Updated `AdminGates.tsx` form to include capacity type selection
- Modified gate cards to display capacity information dynamically
- Improved statistics cards with better color contrast (blue/green/purple tones)
- Migrated from React Query v4 to v5 API (`isLoading` → `isPending`, updated `invalidateQueries`)

### Fixed
- Server stability issues with Redis fallback (process no longer exits on connection errors)
- TypeScript compilation errors in AdminGates component
- Signal handling for graceful server shutdown (SIGINT/SIGTERM)

### Technical Details
- Database: Added `gate_capacity_type` enum with values `limited`, `unlimited`, `unmeasured`
- Schema: Added `capacityType` and `capacity` columns to `gates` table
- Migration: Auto-generated and applied Drizzle migration `0000_sour_tomorrow_man.sql`
- API: Gate creation endpoint now accepts `capacityType` and optional `capacity` fields

---

## [1.0.0] - 2025-10-11

### Initial Release
- Complete event access control system
- JWT authentication with role-based access control
- Admin dashboard with CRUD operations
- Dual QR check-in modes (Gate-QR and Ticket-QR)
- Real-time monitoring with WebSocket support
- Anti-fraud duplicate prevention
- PostgreSQL database with Drizzle ORM
- Redis caching and session management
- Export capabilities (CSV reports)
- Mobile-first PWA experience
