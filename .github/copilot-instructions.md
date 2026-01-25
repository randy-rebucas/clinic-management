# Copilot Instructions for MyClinicSoft

## Project Overview
- **MyClinicSoft** is a Next.js 16 (App Router) + MongoDB clinic management system.
- Key features: patient management, appointments, billing, prescriptions, lab results, inventory, audit logging, notifications, and more.
- Follows a modular, domain-driven structure: see `app/`, `components/`, `models/`, `lib/`.

## Architecture & Patterns
- **API routes**: All backend logic is in `app/api/` (RESTful, resource-oriented, e.g., `/api/patients`, `/api/appointments`).
- **Data models**: Defined in `models/` using Mongoose. Relationships and validation are enforced at the model level.
- **UI**: React components in `components/`, with `*PageClient.tsx` for client-side logic and `*Form.tsx` for forms.
- **Utilities**: Shared logic in `lib/` (e.g., `dal.ts` for data access, `auth-helpers.ts`, `cloudinary.ts`, `sms.ts`).
- **Docs**: See `docs/` for feature-specific guides (billing, cron, security, etc.).

## Developer Workflows
- **Install & setup**: `npm run install:setup` (checks Node, installs deps, creates `.env.local`, validates, seeds, admin setup)
- **Run dev server**: `npm run dev` (Turbopack, fast, but source map warnings) or `npm run dev:webpack` (no warnings, slower)
- **Build**: `npm run build` | **Start**: `npm start`
- **Lint**: `npm run lint`
- **Seed DB**: `npm run seed`
- **Create admin**: `npm run setup:admin`

## Conventions & Integration
- **Environment**: Secrets in `.env.local` (never commit); template in `.env.example`.
- **External services**: Cloudinary (docs), Twilio (SMS), SMTP (email), Sentry (monitoring), n8n (automation in `n8n_automation/`).
- **API**: Use RESTful patterns, return JSON, validate input, handle errors with proper status codes.
- **Security**: JWT auth, PH DPA compliance, audit logging, encryption (see `lib/encryption.ts`).
- **Testing**: See `__tests__/` for API and lib tests. Use `vitest` or `jest` as configured.

## Examples
- Add a new resource: create Mongoose model in `models/`, API handlers in `app/api/[resource]/`, UI in `components/`, update docs if needed.
- Integrate with external service: add logic in `lib/`, configure env vars, document in `docs/`.

## References
- Main docs: [README.md](../README.md)
- Data relationships: `models/RELATIONSHIPS.md`
- Feature guides: `docs/`
- Automation: `n8n_automation/README.md`

---
**For AI agents:**
- Follow existing patterns for API, models, and UI.
- Reference docs before introducing new dependencies or patterns.
- Prefer explicit, modular code. Use TypeScript types and validation.
- Ask for clarification if a workflow or integration is unclear.
