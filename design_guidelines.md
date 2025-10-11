# Event Access Control System - Design Guidelines

## Design Approach: Material Design System
**Justification**: This utility-focused, data-intensive application requires a proven design system that excels at information hierarchy, real-time data visualization, and multi-platform consistency. Material Design provides robust patterns for dashboards, data tables, and mobile-first interactions essential for event management workflows.

**Core Principles**:
- Clarity over decoration - prioritize functionality and data readability
- Instant feedback - visual confirmation for every critical action (check-ins, scans)
- Trust through professionalism - clean, corporate aesthetic suitable for enterprise events
- Mobile-first for staff operations, desktop-optimized for admin dashboards

---

## Color Palette

### Light Mode
- **Primary**: 260 70% 50% (Deep purple - brand authority, tech-forward)
- **Primary Variant**: 260 70% 40% (hover states)
- **Secondary**: 200 85% 45% (Cyan - actions, real-time updates)
- **Success**: 142 76% 36% (check-in confirmed)
- **Error**: 0 84% 60% (denied/duplicate entries)
- **Warning**: 38 92% 50% (alerts, capacity warnings)
- **Background**: 0 0% 98%
- **Surface**: 0 0% 100%
- **Text Primary**: 0 0% 13%
- **Text Secondary**: 0 0% 38%

### Dark Mode (Primary for Staff)
- **Primary**: 260 70% 65%
- **Primary Variant**: 260 70% 75%
- **Secondary**: 200 85% 55%
- **Background**: 240 10% 8%
- **Surface**: 240 8% 12%
- **Surface Elevated**: 240 8% 16%
- **Text Primary**: 0 0% 95%
- **Text Secondary**: 0 0% 70%

---

## Typography

**Font Stack**: 
- Primary: 'Inter' (Google Fonts) - clean, highly legible for data
- Monospace: 'JetBrains Mono' - for codes, IDs, timestamps

**Hierarchy**:
- **Hero/Page Titles**: 2.5rem (40px), font-weight 700, tracking-tight
- **Section Headers**: 1.875rem (30px), font-weight 600
- **Card Titles**: 1.25rem (20px), font-weight 600
- **Body Text**: 0.938rem (15px), font-weight 400, line-height 1.6
- **Captions/Meta**: 0.813rem (13px), font-weight 500, text-secondary
- **Data/Metrics**: 2rem (32px), font-weight 700, monospace for numbers

---

## Layout System

**Spacing Scale**: Use Tailwind units of **4, 6, 8, 12, 16** for consistent rhythm
- Component padding: p-6 or p-8
- Section spacing: py-12 or py-16
- Grid gaps: gap-4 or gap-6
- Card margins: mb-6 or mb-8

**Grid Structure**:
- Dashboard: 12-column grid with gap-6
- Mobile: Single column stack
- Tablet: 2-column for cards
- Desktop: 3-4 column for metrics cards

**Containers**:
- Public pages: max-w-7xl mx-auto
- Dashboard: Full-width with px-6 lg:px-8
- Forms: max-w-md mx-auto

---

## Component Library

### Navigation
- **Public Header**: Transparent over hero, solid white on scroll, sticky top-0
- **Admin Sidebar**: Fixed left, w-64, collapsible to icons-only, dark surface
- **Mobile Nav**: Bottom navigation bar for staff scanning interface

### Cards & Surfaces
- **Metric Cards**: Elevated surface, rounded-lg, p-6, shadow-md, hover:shadow-lg transition
- **Gate Cards**: Border-l-4 with gate status color (green=active, gray=inactive, red=error)
- **Ticket Display**: max-w-sm, centered QR, gradient border for visual appeal

### Data Display
- **Real-time Metrics**: Large numerals (text-4xl), small label above, trend indicator (↑↓)
- **Tables**: Striped rows, sticky header, hover highlight, compact spacing (py-3)
- **Live Feed**: Chat-like stream, newest top, auto-scroll, timestamp on right

### Forms & Inputs
- **Input Fields**: h-12, rounded-md, border-2, focus:ring-2 focus:ring-primary, dark mode friendly
- **Buttons Primary**: h-12, px-8, rounded-md, font-semibold, shadow-sm
- **Buttons Secondary**: variant="outline", h-12, when on images use backdrop-blur-md bg-white/10
- **QR Scanner**: Full-screen overlay, camera viewfinder with corner guides, cancel button top-right

### Feedback Elements
- **Check-in Success**: Full-screen overlay, large checkmark icon, attendee name, gate info, auto-dismiss 3s
- **Toast Notifications**: Bottom-right, max-w-sm, slide-in animation, icon + message
- **Loading States**: Skeleton screens for dashboard, spinner for actions

### Real-time Indicators
- **Live Pulse**: Animated green dot next to "LIVE" label on metrics
- **Gate Status Badge**: Pill shape, icon + text, positioned top-right of gate cards
- **Capacity Bars**: Horizontal progress bars with percentage, color-coded thresholds

---

## Page-Specific Layouts

### Public Registration (/register)
- Clean, centered single-column form
- Progress indicator for multi-step flow
- Trust indicators: event logo, secure badge, "Join 1,200+ attendees"

### Personal Ticket (/me/ticket)
- Centered ticket card with QR code (size: 280px)
- Attendee details below QR
- Download PDF button (primary), Share button (secondary)
- Background: subtle gradient or pattern

### Staff Scanner Interface
- Minimal UI, maximum camera viewport
- Gate selector dropdown top-center
- Last check-in result: floating card, bottom-center
- Quick stats: compact strip top showing today's count

### Admin Dashboard (/admin/dashboard)
- Top: KPI cards (4-column grid) - Total Entries, Current Rate, Duplicates, Active Gates
- Middle: Real-time line chart (entries over time, multi-gate overlay)
- Bottom-left: Gate status grid (2-3 columns)
- Bottom-right: Recent activity feed

### Gate Management (/admin/gates)
- Table view with inline actions
- Gate QR preview modal
- Quick enable/disable toggle with confirmation

---

## Animations & Interactions

**Minimal Motion** (respecting event environment):
- Card hover: subtle scale(1.02) + shadow increase, 200ms ease
- Page transitions: fade, no slide animations
- Check-in success: scale-in icon with ease-out, 300ms
- Real-time updates: gentle fade-in for new entries, 150ms
- NO: Continuous animations, parallax, complex scroll effects

---

## Images

### Hero Section (Public Pages)
- Large, professional event photography (conferences, concerts, sports)
- Overlay: gradient from transparent to background color
- Image position: Cover, center-center
- Suggested: Crowd at well-lit event, or modern venue entrance with QR scanner visible

### Dashboard (No Images)
- Icon-based, data-focused, no decorative imagery
- Use Material Icons for gates, check-ins, alerts

### Empty States
- Simple line illustrations (undraw.co style) for "No check-ins yet", "No events"
- Centered, max-w-xs, subtle gray tone

---

## Accessibility & Dark Mode

- Dark mode default for staff roles (toggleable)
- Light mode default for public attendees
- All interactive elements: min-height 44px (touch-friendly)
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Form inputs: Clear labels, error states with text + color
- QR scanner: High contrast camera overlay guides

---

## Mobile Optimization

- Touch targets: minimum 48px × 48px
- Scanner: Use full device width, responsive height
- Tables: Horizontal scroll or card transformation on mobile
- Bottom navigation: Fixed, 5 icons max for staff
- Gestures: Swipe to refresh metrics, pull-to-update

This design system balances professional credibility with operational efficiency, ensuring staff can work quickly in live event conditions while attendees experience a polished, trustworthy registration flow.