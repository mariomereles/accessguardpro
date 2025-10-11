# Event Access Control System

## Overview

A professional, enterprise-grade event access control system built with dual QR code technology for fast, secure attendee check-ins across multiple gates. The system features real-time monitoring, comprehensive analytics, and supports concurrent operations at multiple entry points.

**Core Capabilities:**
- Dual QR Mode: Gate-QR (auto check-in) and Ticket-QR (staff scan)
- Multi-gate concurrent operations with real-time synchronization
- Role-based access control (Admin, Organizer, Staff, User)
- Live analytics and activity monitoring via WebSocket
- Progressive Web App (PWA) experience for mobile and desktop

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript and Vite for fast development and optimized builds
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- Material Design principles via Shadcn/UI component library with Tailwind CSS
- Dark mode as primary theme for staff operations, light mode available

**Design System:**
- Material Design-based UI with emphasis on data clarity and real-time feedback
- Custom color palette: Deep purple primary (260 70% 50%), cyan secondary for actions
- Typography: Inter for UI, JetBrains Mono for codes/data
- Responsive mobile-first design optimizing for staff handheld devices

**State Management:**
- React Query handles all server state with automatic caching and refetching
- Local state via React hooks for UI-specific concerns
- WebSocket integration for real-time event updates
- LocalStorage for auth tokens and user preferences

**Key Components:**
- QR Scanner using html5-qrcode library with camera access
- Real-time dashboard with live metrics and activity feeds
- Form validation using React Hook Form with Zod schemas
- Chart visualizations using Recharts library

### Backend Architecture

**Runtime & Framework:**
- Node.js 20+ with Express.js web framework
- TypeScript for type safety across the entire stack
- ESM module system for modern JavaScript practices

**Authentication & Security:**
- JWT-based authentication using RS256 (RSA asymmetric encryption)
- Dual token system: Ticket QR (RS256) and Gate QR (HS256)
- Role-based access control middleware
- bcryptjs for password hashing with salt rounds

**Real-time Communication:**
- Socket.IO for WebSocket connections
- Event-based pub/sub pattern for live updates
- Room-based subscriptions (per event) for targeted broadcasts

**Data Validation:**
- Zod schemas for input validation on all endpoints
- Shared schema definitions between client and server
- Drizzle-Zod integration for type-safe database operations

**Concurrency & Race Conditions:**
- Redis for distributed locks preventing duplicate check-ins
- In-memory fallback for development without Redis
- Optimistic concurrency control for high-throughput scenarios

**API Design:**
- RESTful endpoints organized by resource
- Consistent error handling with appropriate HTTP status codes
- Request/response logging middleware for debugging

### Database Architecture

**Primary Database:**
- PostgreSQL via Neon serverless driver with WebSocket support
- Drizzle ORM for type-safe query building
- Schema-first approach with migrations in `/migrations` directory

**Schema Design:**
- **users**: Authentication and role management (ADMIN, ORGANIZER, STAFF, USER)
- **events**: Event metadata with status tracking (DRAFT, ACTIVE, ENDED, CANCELLED)
- **gates**: Entry points with location and active status
- **attendees**: Registration data linked to events and optional user accounts
- **tickets**: Generated QR codes (JWT tokens) with type classification
- **checkins**: Transaction log with method, result, and timestamp
- **metricsCounters**: Aggregated statistics for analytics
- **auditLogs**: Security and compliance trail

**Key Relationships:**
- Events → Gates (one-to-many)
- Events → Attendees (one-to-many)
- Attendees → Tickets (one-to-one)
- Gates + Tickets → Checkins (many-to-many through checkins table)

**Indexing Strategy:**
- Foreign key indexes for join performance
- Composite indexes on email + eventId for duplicate prevention
- Timestamp indexes for time-based queries

### Caching & Performance

**Redis Layer:**
- Distributed locks using SETNX for check-in deduplication
- QR code rotation cache (5-minute TTL for gate QRs)
- Session token blacklisting for logout
- In-memory Map fallback when Redis unavailable

**Cache Invalidation:**
- Time-based expiry for rotating QR codes
- Manual invalidation on critical state changes
- React Query automatic cache updates on mutations

## External Dependencies

### Third-Party Services

**Database:**
- Neon Serverless PostgreSQL (DATABASE_URL environment variable required)
- Connection pooling via @neondatabase/serverless
- WebSocket-based protocol for serverless compatibility

**Caching (Optional):**
- Redis 7+ for production deployments (REDIS_URL environment variable)
- Graceful degradation to in-memory storage if unavailable

**Authentication:**
- Self-hosted JWT with RSA key pair generation
- No external auth providers (credentials-based only)

### NPM Packages

**UI Framework:**
- @radix-ui/* - Headless UI primitives for accessibility
- class-variance-authority - Type-safe component variants
- tailwindcss - Utility-first CSS framework
- lucide-react - Icon library

**QR & Scanning:**
- html5-qrcode - Browser-based QR code scanning
- qrcode - QR code generation for tickets

**Forms & Validation:**
- react-hook-form - Performant form state management
- @hookform/resolvers - Zod integration for validation
- zod - TypeScript-first schema validation

**Data Fetching:**
- @tanstack/react-query - Server state management
- socket.io-client - WebSocket client

**Database & ORM:**
- drizzle-orm - TypeScript ORM
- drizzle-kit - Migration tooling
- @neondatabase/serverless - Neon database driver

**Security:**
- jsonwebtoken - JWT creation and verification
- bcryptjs - Password hashing

**Development:**
- vite - Build tool and dev server
- tsx - TypeScript execution for Node.js
- esbuild - Fast bundler for production

### Environment Configuration

**Required Variables:**
- `DATABASE_URL` - PostgreSQL connection string from Neon
- `NODE_ENV` - development/production flag

**Optional Variables:**
- `REDIS_URL` - Redis connection string
- `GATE_HS_SECRET_DEFAULT` - HMAC secret for gate QR codes (defaults to "change_me_in_production")

### Deployment Architecture

**Platform:**
- Designed for CloudPanel + Nginx + PM2 deployment
- No Docker containerization
- Process management via PM2 for clustering and auto-restart
- Nginx reverse proxy for SSL termination and static file serving

**Build Process:**
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles to `dist/index.js`
- Separate build commands for client and server

**Asset Serving:**
- Static files served by Nginx in production
- Vite dev server in development with HMR support