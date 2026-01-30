# Copilot Instructions for MyClinicSoft

## Project Overview
# Copilot Instructions for MyClinicSoft

- MyClinicSoft is a modular clinic management system built with Next.js 16 (App Router) and MongoDB. It covers patient management, appointments, billing, prescriptions, lab results, inventory, audit logging, notifications, and more. The codebase is organized for clarity, extensibility, and compliance.

## Architecture & Patterns
- **API Layer:** All backend logic is in `app/api/`, following RESTful, resource-oriented conventions (e.g., `/api/patients`, `/api/appointments`). Each resource has its own folder and handler files.
- **Data Models:** Defined in `models/` using Mongoose. Relationships and validation are enforced at the model level. See `models/RELATIONSHIPS.md` for details.
- **UI Components:** React components live in `components/`. Use `*PageClient.tsx` for client-side logic, `*Form.tsx` for forms, and keep UI modular. Pages are in `app/`, grouped by feature.
- **Utilities:** Shared logic is in `lib/` (e.g., `dal.ts` for data access, `auth-helpers.ts`, `cloudinary.ts`, `sms.ts`).
- **Docs:** Feature-specific guides are in `docs/` (e.g., billing, cron, security, integrations).

## Developer Workflows
- **Install & Setup:** `npm run install:setup` (checks Node, installs deps, creates `.env.local`, validates, seeds, admin setup)
- **Run Dev Server:** `npm run dev` (Turbopack, fast, source map warnings) or `npm run dev:webpack` (no warnings, slower)
- **Build:** `npm run build`  
	**Start:** `npm start`
- **Lint:** `npm run lint`
- **Seed DB:** `npm run seed`
- **Create Admin:** `npm run setup:admin`
- **Testing:** See `__tests__/` for API and lib tests. Use `vitest` or `jest` as configured.

## Conventions & Integration
- **Environment:** Secrets in `.env.local` (never commit); template in `.env.example`.
- **External Services:** Cloudinary (see `lib/cloudinary.ts`), Twilio (SMS, `lib/sms.ts`), SMTP (email, `lib/email.ts`), Sentry (monitoring), n8n (automation in `n8n_automation/`).
- **API:** Use RESTful patterns, return JSON, validate input, handle errors with proper status codes. See `app/api/` for examples.
- **Security:** JWT auth, PH DPA compliance, audit logging, encryption (see `lib/encryption.ts`).
- **UI:** Use modular, explicit React components. Prefer client/server separation as in `*PageClient.tsx` and `*Form.tsx` patterns.

## Examples
- **Add a Resource:**
	1. Create a Mongoose model in `models/`
	2. Add API handlers in `app/api/[resource]/`
	3. Add UI in `components/` and `app/[resource]/`
	4. Update docs if needed
- **Integrate External Service:**
	- Add logic in `lib/`, configure env vars, document in `docs/`
- **Testing:**
	- Place tests in `__tests__/api/` or `__tests__/lib/` as appropriate

## References
- Main docs: [README.md](../../README.md)
- Data relationships: `models/RELATIONSHIPS.md`
- Feature guides: `docs/`
- Automation: `n8n_automation/README.md`

---
**For AI agents:**
- Follow existing patterns for API, models, and UI. Reference docs before introducing new dependencies or patterns.
- Use explicit, modular TypeScript code. Validate input and handle errors as in existing API handlers.
- When in doubt, review similar files in `app/api/`, `models/`, and `components/` for examples.
