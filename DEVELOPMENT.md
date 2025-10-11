# AccessGuard Pro - Development Guide

## 🛠️ Development Workflow

### Starting Development Environment

**Option 1: Full Stack (Recommended)**
```powershell
# Terminal 1: Start backend server
npm run dev:server

# Terminal 2: Start frontend dev server
npm run dev:client
```

**Option 2: Standalone Server (No Hot Reload)**
```powershell
# Build and run server without tsx restarts
npm run dev:server:standalone
```

**Option 3: Detached Background Server**
```powershell
# Run server in background (Windows)
npm run dev:server:detached
```

### Access Points
- **Frontend**: http://localhost:5500
- **Backend API**: http://localhost:5503 (or PORT env variable)
- **Admin Dashboard**: http://localhost:5500 → Login with admin credentials

---

## 📊 Database Management

### Migrations
```bash
# Generate migration after schema changes
npx drizzle-kit generate

# Push schema changes to database
npm run db:push

# View current schema
npx drizzle-kit studio
```

### Seeding Data
```bash
# Create sample data (events, gates, attendees)
npx tsx server/seed.ts
```

---

## 🔐 Authentication Testing

### Create Admin User via API
```powershell
Invoke-WebRequest -Uri http://localhost:5503/api/auth/register `
  -Method POST `
  -Body '{"email":"admin@test.com","password":"admin123","role":"ADMIN"}' `
  -ContentType "application/json"
```

### Login and Get Token
```powershell
$response = Invoke-WebRequest -Uri http://localhost:5503/api/auth/login `
  -Method POST `
  -Body '{"email":"admin@test.com","password":"admin123"}' `
  -ContentType "application/json"

$token = ($response.Content | ConvertFrom-Json).accessToken
```

### Use Token in Requests
```powershell
$headers = @{"Authorization"="Bearer $token"}

Invoke-WebRequest -Uri http://localhost:5503/api/gates `
  -Method GET `
  -Headers $headers
```

---

## 🚪 Gate Management Examples

### Create Gate with Limited Capacity
```powershell
Invoke-WebRequest -Uri http://localhost:5503/api/gates `
  -Method POST `
  -Headers @{"Authorization"="Bearer $token"} `
  -Body '{"eventId":"event-uuid","name":"Main Entrance","location":"Building A","capacityType":"limited","capacity":500}' `
  -ContentType "application/json"
```

### Create Unlimited Capacity Gate
```powershell
Invoke-WebRequest -Uri http://localhost:5503/api/gates `
  -Method POST `
  -Headers @{"Authorization"="Bearer $token"} `
  -Body '{"eventId":"event-uuid","name":"Emergency Exit","location":"Building B","capacityType":"unlimited"}' `
  -ContentType "application/json"
```

### Create Unmeasured Gate
```powershell
Invoke-WebRequest -Uri http://localhost:5503/api/gates `
  -Method POST `
  -Headers @{"Authorization"="Bearer $token"} `
  -Body '{"eventId":"event-uuid","name":"Staff Entrance","location":"Back Door","capacityType":"unmeasured"}' `
  -ContentType "application/json"
```

---

## 🧪 Testing

### Manual API Testing
```powershell
# List all gates
Invoke-WebRequest -Uri http://localhost:5503/api/gates -Method GET

# Get events
Invoke-WebRequest -Uri http://localhost:5503/api/events -Method GET -Headers $headers

# Get attendees
Invoke-WebRequest -Uri http://localhost:5503/api/attendees -Method GET -Headers $headers
```

### Frontend Testing
1. Open http://localhost:5500
2. Navigate to Admin Login
3. Login with credentials
4. Test CRUD operations in dashboard

---

## 🐛 Debugging

### Server Logs
- Express logs are timestamped with `[express]` prefix
- API requests show method, path, status, and duration
- Redis connection errors are logged but don't crash the server

### Common Issues

**Port Already in Use**
```powershell
# Kill processes on ports 5500, 5501, 5503
npx kill-port 5500 5501 5503

# Or manually find and kill
netstat -ano | findstr ":5503"
taskkill /PID <PID> /F
```

**Database Connection Issues**
- Verify `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check database exists: `psql -U user -d dbname`

**Redis Connection Errors**
- Redis is optional - server uses in-memory fallback
- Error logged but doesn't crash: `[redis] connection error, falling back to in-memory Redis`

---

## 📦 Build & Deployment

### Production Build
```bash
# Build frontend and backend
npm run build

# Output:
# - dist/public/* (frontend static files)
# - dist/index.js (bundled backend)
```

### Production Start
```bash
# Simple start
npm start

# With PM2 (recommended)
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🎨 UI Development

### Component Structure
- `client/src/components/` - Reusable UI components
- `client/src/pages/` - Page-level components
- `client/src/components/ui/` - Shadcn UI primitives

### Styling
- Tailwind CSS for utility classes
- CSS variables for theme colors
- Dark mode support via `ThemeProvider`

### Adding New Pages
1. Create component in `client/src/pages/`
2. Import in `client/src/App.tsx`
3. Add route with React Router
4. Protect with `ProtectedRoute` if needed

---

## 🔑 Environment Variables

### Required
```env
DATABASE_URL=postgresql://user:password@localhost:5432/accessguard
PORT=5503
```

### Optional
```env
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY_PATH=./private.pem
JWT_PUBLIC_KEY_PATH=./public.pem
NODE_ENV=development
INTEGRATE_VITE=true
```

---

## 📚 Architecture Notes

### Backend
- **Express** for API routing
- **Drizzle ORM** for type-safe database queries
- **Socket.IO** for real-time updates
- **JWT** with RS256 signing (public/private key pair)

### Frontend
- **React 18** with TypeScript
- **TanStack Query** for server state management
- **React Router** for navigation
- **Shadcn/UI** for component primitives

### Database Schema
- Users, Events, Gates, Attendees, Tickets, Checkins
- Enums for roles, statuses, ticket types, checkin methods
- Foreign keys with referential integrity

---

## 🚀 Performance Tips

### Development
- Use `dev:server:standalone` to avoid tsx hot reload issues
- Redis optional in dev (uses in-memory fallback)
- Vite HMR for instant frontend updates

### Production
- Build with `npm run build` for optimized bundle
- Use PM2 for zero-downtime restarts
- Enable gzip in Nginx config
- Use PostgreSQL connection pooling

---

## 📖 Additional Resources

- **Drizzle Docs**: https://orm.drizzle.team
- **Shadcn/UI**: https://ui.shadcn.com
- **TanStack Query**: https://tanstack.com/query
- **React Router**: https://reactrouter.com
