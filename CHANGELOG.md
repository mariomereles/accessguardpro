# Changelog

All notable changes to AccessGuard Pro will be documented in this file.

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
