# AccessGuard Pro - Event Access Control System

A professional, scalable, and secure event access control system using QR codes for attendee check-in with comprehensive authentication and admin dashboard.

## ✨ Features

- **🔐 Authentication System**: Secure login with JWT tokens and role-based access control
- **📊 Admin Dashboard**: Complete CRUD operations for events, gates, attendees, and analytics
- **🎫 Dual QR Modes**: Gate-QR (auto-checkin) and Ticket-QR (staff scan)
- **📈 Real-time Monitoring**: Live metrics and analytics per gate
- **🛡️ Anti-fraud Protection**: Duplicate prevention and security measures
- **🚪 Multi-gate Support**: Concurrent check-ins across multiple entry points with capacity management
- **📱 PWA Experience**: Mobile-first design for staff and attendees
- **📋 Export Capabilities**: CSV reports and data exports
- **👥 Role-based Access**: Admin, Organizer, Staff, and User roles
- **🎯 Gate Capacity Management**: Limited capacity, unlimited, or unmeasured capacity tracking per gate

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Shadcn/UI + TanStack Query
- **Backend**: Node.js 20 + Express + TypeScript + Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Cache**: Redis for locks and session management
- **Auth**: JWT with role-based permissions
- **Deployment**: PM2 + Nginx (no Docker)

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL
- Redis (optional)
- PM2 and Nginx (for production)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd accessguard-pro
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your database and other settings
```

4. **Generate JWT keys**
```bash
# Generate private key for JWT signing
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

5. **Set up database**
```bash
# Push schema to database
npm run db:push

# Seed with sample data (creates admin user)
npx tsx server/seed.ts
```

6. **Start development server**
```bash
npm run dev
```

## 🔑 Authentication & Access

### Initial users

`npx tsx server/seed.ts` creates a **development** admin (`admin@event.com`) and staff user (`staff@event.com`) with well-known passwords.
Use it only on local databases, or change those passwords immediately. Public sign-up always creates a `USER`;
ADMIN / ORGANIZER / STAFF accounts must be created by an administrator or by script.

### Accessing Admin Dashboard

1. **Open the application**: `http://localhost:5500`
2. **Click "Admin Login"** on the homepage
3. **Use admin credentials** to login
4. **Access full dashboard** with CRUD operations

### User Roles & Permissions

- **ADMIN**: Full access to all features and CRUD operations
- **ORGANIZER**: Event management and gate control
- **STAFF**: QR scanning and check-in operations
- **USER**: Attendee registration and ticket access

## 📱 Usage Guide

### For Administrators

1. **Login** with admin credentials
2. **Dashboard Overview**: View real-time metrics and analytics
3. **Manage Events**: Create, edit, and configure events
4. **Control Gates**: Add/remove gates, toggle status, monitor activity
5. **View Attendees**: Browse registrations and check-in status
6. **Export Data**: Generate reports and CSV exports

### For Staff

1. **Access scanner** at `/staff/scanner`
2. **Scan QR codes** for check-in
3. **View assigned gates** and status
4. **Monitor real-time activity**

### For Attendees

1. **Register** for events at `/register`
2. **Receive QR ticket** via email/PDF
3. **Check-in** using gate QR or staff scan
4. **View ticket** at `/me/ticket`

## 🧪 Testing

Use the included test suite to verify functionality:

1. Open `test-suite.html` in your browser
2. Run individual tests or the full authentication flow
3. Verify login, protected routes, and API access

## 📁 Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React contexts (Auth)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and API client
│   │   └── pages/          # Page components
├── server/                 # Express backend
│   ├── routes.ts           # API routes
│   ├── middleware.ts       # Auth middleware
│   ├── storage.ts          # Database operations
│   └── crypto.ts           # JWT and encryption
├── shared/                 # Shared types/schemas
└── migrations/             # Database migrations
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Token refresh

### Protected Routes (Admin)
- `GET /api/gates` - List all gates with capacity information
- `POST /api/gates` - Create new gate (supports capacityType: "limited"|"unlimited"|"unmeasured", capacity: number)
- `PATCH /api/gates/:id/status` - Toggle gate status
- `GET /api/events` - List events
- `POST /api/events` - Create event
- `GET /api/attendees` - List attendees

### Gate Creation Payload Example
```json
{
  "eventId": "event-uuid",
  "name": "Main Entrance",
  "location": "Building A - Ground Floor",
  "capacityType": "limited",
  "capacity": 500
}
```

**Capacity Types**:
- `limited` - Requires `capacity` field (numeric limit)
- `unlimited` - No capacity limit (capacity field ignored)
- `unmeasured` - Capacity not tracked (capacity field ignored)

## 🚀 Deployment

### Production Setup

1. **Build the application**
```bash
npm run build
```

2. **Start production server**
```bash
npm start
```

3. **Use PM2 for process management**
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
REDIS_URL=redis://localhost:6379
PORT=5501
JWT_PRIVATE_KEY_PATH=./private.pem
JWT_PUBLIC_KEY_PATH=./public.pem
NODE_ENV=production
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.
```bash
mkdir keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

5. Set up database
```bash
npm run db:push
npm run seed
```

6. Start development servers
```bash
# Terminal 1: Backend
npm run dev:server

# Terminal 2: Frontend
npm run dev:client
```

7. Access the application
- Frontend: http://localhost:5500
- Backend API: http://localhost:5503

## Production Deployment

### Build the application
```bash
npm run build
```

### PM2 Configuration
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Nginx Configuration
Copy `nginx.conf` to `/etc/nginx/sites-available/yourdomain.com` and enable it.

### SSL Setup
```bash
certbot --nginx -d yourdomain.com
```

### Backup Setup
```bash
chmod +x backup.sh
# Add to crontab: 0 2 * * * /path/to/backup.sh
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh tokens

### Tickets
- `POST /api/events/:eventId/attendees` - Register for event
- `GET /api/me/ticket?eventId=X&format=pdf` - Get ticket (JSON or PDF)

### Check-ins
- `GET /api/gates/:gateId/qr` - Get rotating gate QR
- `POST /api/checkins` - Perform check-in (modes A/B)

### Admin
- `GET /api/events/:eventId/metrics` - Event metrics
- `GET /api/events/:eventId/exports/checkins.csv` - Export CSV

## Security Features

- JWT RS256 tokens with refresh rotation
- Argon2id password hashing
- Anti-duplicate Redis locks
- Audit logging
- HTTPS enforcement
- CORS protection

## Architecture

```
Frontend (PWA) ←→ API Gateway ←→ Backend Services
     ↓                    ↓              ↓
   Vite            Express + Socket.IO   PostgreSQL + Redis
     ↓                    ↓              ↓
   React            TypeScript         Drizzle ORM
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details