# Copilot Instructions for Clinic Management System

## Project Overview
- **Stack:** Next.js 16 (App Router), TypeScript, MongoDB (Mongoose), Tailwind CSS
- **Purpose:** Modern clinic management with patient, doctor, appointment, billing, inventory, documents, and more
- **Architecture:** Modular, feature-based folders under `app/` and `components/`, API routes in `app/api/`, models in `models/`, utilities in `lib/`

## Key Patterns & Conventions
- **App Router:** All main pages and API routes are under `app/`. Use file-based routing (`app/[feature]/page.tsx`, `app/api/[feature]/route.ts`)
- **Client Components:** Suffix `*PageClient.tsx` and `*FormClient.tsx` for interactive React components
- **Forms:** Use form components in `components/` for CRUD operations; validation is typically handled client-side
- **Models:** Mongoose models in `models/` define schema, relationships, and validation
- **Utilities:** Shared logic (auth, permissions, notifications, audit, encryption, Cloudinary, Twilio, SMTP) in `lib/`
- **Permissions:** Role-based access control via helpers in `lib/permissions.ts` and related docs
- **Environment:** Secrets in `.env.local` (never commit); template in `.env.example`

## Developer Workflows
- **Setup:**
  - `npm install` to install dependencies
  - `cp .env.example .env.local` and configure secrets
  - `npm run setup:admin` to create first admin user
- **Run:**
  - `npm run dev` (Turbopack, fast, but source map warnings)
  - `npm run dev:webpack` (slower, no warnings)
  - `npm run build` for production
  - `npm start` to serve production
- **Lint:** `npm run lint`
- **Create Admin:** `npm run setup:admin`

## Integration Points
- **Cloudinary:** Document/image uploads via `lib/cloudinary.ts` and related API routes
- **Twilio:** SMS reminders via `lib/sms.ts` and API endpoints
- **SMTP:** Email notifications via `lib/email.ts`
- **Audit Logging:** All sensitive actions logged via `lib/audit.ts` and `app/api/audit-logs/`

## Data Flow & Service Boundaries
- **API:** RESTful endpoints in `app/api/[feature]/`; see README for endpoint list
- **Models:** Each feature has a corresponding Mongoose model in `models/`
- **Pages:** UI logic in `app/[feature]/` and `components/`
- **Utilities:** Cross-cutting concerns in `lib/`

## Project-Specific Notes
- **Source Map Warnings:** Ignore in dev (`npm run dev`); use `npm run dev:webpack` if needed
- **Environment Variables:** Always update `.env.local` and restart server
- **Documentation:** See `docs/` for feature guides and integration setup
- **Security:** PH DPA compliance, audit logging, encrypted data, strict access controls

## Examples
- To add a new feature, create a folder in `app/`, add API routes in `app/api/`, model in `models/`, and UI in `components/`
- For permissions, use helpers in `lib/permissions.ts` and reference `ADMIN_ROLES_PERMISSIONS.md`
- For document uploads, use Cloudinary via `lib/cloudinary.ts` and related API endpoints

---
For more details, see `README.md` and documentation in `docs/`. If any conventions or workflows are unclear, ask for clarification or check the relevant doc file.
