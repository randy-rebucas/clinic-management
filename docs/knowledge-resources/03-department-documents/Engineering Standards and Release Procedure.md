# Engineering Standards and Release Procedure

## Summary

"Engineering Standards and Release Procedure" sets out how the DevCom Digital engineering team writes, checks and releases changes to the MyClinicSoft web platform and the eMCR and MyClinicSoft Rep mobile apps. It covers code style, branches and pull requests, testing, release steps, rollback, change approvals and incident hand-over. The written rules come from `.github/workflows/ci.yml`, `README.md`, `__tests__/README.md` and `package.json`: the web platform uses pnpm only, and every push and pull request to `main` must pass type-checking, linting, tests, a dependency audit and a production build. Several points that a release procedure needs (who reviews, who approves, how to roll back) are not written down anywhere yet and are marked [TO CONFIRM]. Step-by-step production procedures live in their own documents and are referred to by title.

## Code style rules

The MyClinicSoft web platform code standards written in the repository are:

| Rule | Source |
|---|---|
| TypeScript throughout; type-check with `pnpm run typecheck` (`tsc --noEmit`) | `package.json`; `README.md` |
| Lint with ESLint: `pnpm run lint` (`eslint.config.mjs`) | `package.json` |
| pnpm only (version 10.33.0, from `packageManager`); never commit a `package-lock.json` | `README.md`; `package.json` |
| Node.js 20.9 or higher (CI uses Node.js 22) | `package.json`; `ci.yml` |
| A new resource follows the existing layout: model in `models/`, API handlers in `app/api/[resource]/`, UI in `components/` and `app/[resource]/`, docs updated if needed | `README.md` ("Extending the Application") |
| Next.js 16 has breaking changes from earlier versions; the bundled guides are in `node_modules/next/dist/docs/` | `AGENTS.md` |
| Secrets stay in `.env.local` or `.env.prod.local` and are never committed; `.env.example` lists every setting by name | `README.md`; `docs/LOCAL_DEV_DATABASE.md` |
| A migration script dry-runs by default and writes only with `--apply` | `README.md` |
| A new model or field holding personal data is added to the local-database scrub | `docs/LOCAL_DEV_DATABASE.md` |

The mobile apps use npm, TypeScript and Expo's ESLint config. The MyClinicSoft Rep app has `npm run typecheck`, `npm run lint` and `npm test` (Jest with jest-expo) (`rep/README.md`); the eMCR app documents `npx tsc --noEmit` for type-checking (`mobile/README.md`).

Commit messages in the web platform's history mostly follow a "type(scope): summary" pattern such as `feat(queue): …`, `fix(auth): …`, `perf(…)`, `chore(…)`. The pattern is observed in git history, not a written rule [TO CONFIRM: whether it is the standard].

## Code review rules

Code review rules (who reviews, how many reviewers, what reviewers check) are not written down [TO CONFIRM]. `.github/copilot-instructions.md` also describes conventions, but it is out of date (it uses `npm`, "vitest or jest", and folders that no longer exist) and is not used as a source for this document (contradictions 38 and 41).

## Branches and pull requests

The MyClinicSoft branch and pull request practice:

| Item | Rule or practice | Source |
|---|---|---|
| Main branch | `main` (CI also listens on `master`; the eMCR repository's main branch is `master`) | `ci.yml`; git history |
| Branch names | Prefix by kind of change: `feat/…`, `fix/…`, `perf/…`, `chore/…` (for example `feat/resend-email`, `fix/cloudinary-go-live`). Observed in git history, not a written rule [TO CONFIRM] | git history |
| How changes reach `main` | Through numbered GitHub pull requests (PRs #10 to #39 in the web platform history). Observed in git history, not a written rule [TO CONFIRM] | git history |
| Who reviews | [TO CONFIRM: reviewer role and number of approvals] | not written down |
| Branch protection | [TO CONFIRM: whether `main` requires CI to pass and a review before merge] | not written down |

Every push and pull request to `main` runs the CI job in `.github/workflows/ci.yml`. These checks must pass:

1. `pnpm install --frozen-lockfile` (the lockfile must match `package.json`).
2. Type-check: `pnpm exec tsc --noEmit`.
3. Lint: `pnpm run lint`.
4. Tests: `pnpm run test`.
5. Dependency audit: `pnpm audit --prod --audit-level high` (no high or critical advisories in production dependencies).
6. Production build: `pnpm run build`, with placeholder settings, never real secrets.

A newer push to the same branch cancels the older CI run. The eMCR and MyClinicSoft Rep repositories have no CI workflow [TO CONFIRM: whether one is planned].

## Testing expectations

The MyClinicSoft web platform testing rules come from `__tests__/README.md` and `README.md`:

| Rule | Detail |
|---|---|
| Framework | Vitest (`vitest.config.ts`); Jest is not used in the web platform |
| Where tests live | `__tests__/lib/` (units), `__tests__/api/` (API routes), `__tests__/components/`, `__tests__/e2e/` |
| No real database | Tests mock `@/lib/mongodb` and the models they touch; `vitest.config.ts` points `MONGODB_URI` at an unreachable address as a safeguard |
| Test data | Cleaned up after each test; factories for test data |
| Coverage goals | Unit tests 70%+; integration tests for all API endpoints; end-to-end tests for critical user flows |
| Priorities | Start with critical paths: authentication, payments, data integrity |
| Commands | `pnpm run test`, `pnpm run test:coverage`, `pnpm run test:watch`, `pnpm run test:ui` |

`__tests__/README.md` says "Tests are currently in development", while `README.md` claims "High test coverage" (contradiction 38). The current coverage figure is not recorded [TO CONFIRM]. Whether a change must add tests before merge is not written down [TO CONFIRM].

## Release steps: web platform

The MyClinicSoft web platform release steps, as far as the repository describes them:

1. **Developer (GitHub):** opens a pull request to `main` and lists any migrations, index changes or new environment variables the change needs [TO CONFIRM: whether this is required].
2. **CI (GitHub Actions):** runs the checks in "Branches and pull requests". If any check fails, then the change is not merged.
3. **Reviewer [TO CONFIRM: role]:** reviews and approves the pull request.
4. **Operator [TO CONFIRM: role]:** if the change needs a data migration, then runs it against production before the code is deployed, following "Running a Production Data Migration".
5. **Operator (Vercel):** sets any new environment variables in production. In production the app refuses to start without `MONGODB_URI`, `SESSION_SECRET`, `CRON_SECRET` and `ENCRYPTION_KEY` (`lib/env-validation.ts`).
6. **Developer or operator (GitHub):** merges the pull request. The app is deployed on Vercel [TO CONFIRM: whether the deploy from `main` is automatic or manual].
7. **Operator (command line):** creates any new indexes with `pnpm prod db:indexes --apply` (see "Running a Production Data Migration" for timing; contradiction 61).
8. **Operator:** checks `/api/health` answers normally (it returns 503 when the database is not ready) [TO CONFIRM: other post-release checks].

Feature switch-ons that need their own sequence follow their own document, for example "Going Live with SMS and Phone Codes".

## Release steps: mobile apps

The eMCR release steps, as far as the repository describes them:

1. **Developer:** if the app needs backend changes, then the backend is deployed first. Each eMCR release note says what an older server does with the new app (`mobile/RELEASE_NOTES.md`).
2. **Developer:** sets the new version in `mobile/app.json` (currently 1.1.4).
3. **Developer:** adds a section to `mobile/RELEASE_NOTES.md` with the Google Play "What's new" text (under 500 characters), full notes, and any new native modules or permissions.
4. **Developer (Expo EAS):** builds with the `production` profile; the build number increases automatically and the app version is managed remotely (`mobile/eas.json`) [TO CONFIRM: exact build command].
5. **Developer (Expo EAS):** submits the build to the Google Play production track [TO CONFIRM: exact submit command, and whether a testing track is used first].
6. **Release approver [TO CONFIRM: role]:** approves the store release.

There are no over-the-air updates: a fix reaches phones only through a new store build. iOS is not released yet (contradiction 28). The MyClinicSoft Rep app (version 0.1.0) has not been released and has no EAS project yet (`eas init` has not been run) [TO CONFIRM: release plan].

## Rollback steps

No general rollback procedure for the MyClinicSoft web platform or the mobile apps is written down [TO CONFIRM: rollback procedure]. The rollback points that do exist are:

1. **Configuration changes:** each SMS go-live setting can be reverted on its own; `OTP_PROVIDER=local` is the written rollback for phone codes ("Going Live with SMS and Phone Codes").
2. **Data migrations:** only `db:migrate:contact-family-links` writes an undo file; other migrations rely on a backup taken before the run ("Running a Production Data Migration").
3. **Damaged data:** "Restoring the Database After an Incident".
4. **Code:** returning Vercel to the previous deployment, or reverting the pull request, is not written down [TO CONFIRM].
5. **Mobile apps:** a bad release can only be replaced by a new store build (see "Release steps: mobile apps") [TO CONFIRM: whether a staged rollout is used to limit exposure].

## Change approvals

Change approvals for MyClinicSoft are not written down. The changes below touch production and need an approver [TO CONFIRM: role and limit for each]:

| Change | Approver |
|---|---|
| Merging a pull request to `main` | [TO CONFIRM] |
| Running a migration or index change against production | [TO CONFIRM] |
| Adding or changing a production environment variable or secret | [TO CONFIRM] |
| Pausing scheduled jobs or putting the app in maintenance | [TO CONFIRM] |
| Releasing a mobile build to the store | [TO CONFIRM] |
| Changing prices or plan limits (Platform → Configuration or code) | [TO CONFIRM] |
| Adding a new outside service that receives personal data (a new sub-processor) | [TO CONFIRM; the privacy page lists sub-processors] |

## Incident hand-over

The MyClinicSoft incident hand-over rules are not written down [TO CONFIRM: on-call arrangement, incident channel, hand-over notes]. The procedures that cover specific incidents are:

| Incident | Document |
|---|---|
| Lost, corrupted or overwritten data | "Restoring the Database After an Incident" |
| Suspected personal data breach | "Responding to a Suspected Data Breach" |
| Phone codes not arriving after the SMS go-live | "Going Live with SMS and Phone Codes" |
| A clinic reports a problem | "Handling a Clinic Support Request" |

A hand-over between engineers records at least what happened, when, which clinics and data were affected, and what was changed in production [TO CONFIRM: proposed minimum, taken from the incident steps in `docs/BACKUP_RESTORE.md`].

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Systems Overview; Running a Production Data Migration; Restoring the Database After an Incident; Running the Backup Restore Drill; Going Live with SMS and Phone Codes; Responding to a Suspected Data Breach; Handling a Clinic Support Request |

## Open questions

1. Whether the "type(scope): summary" commit message pattern seen in git history is the standard.
2. Code review rules: who reviews, how many approvals, what reviewers check.
3. Whether the branch prefixes seen in git history (`feat/`, `fix/`, `perf/`, `chore/`) are the standard.
4. Whether every change must reach `main` through a pull request, and whether `main` is protected (CI must pass, review required).
5. Whether CI is planned for the eMCR and MyClinicSoft Rep repositories.
6. Current test coverage, and whether a change must add tests before merge. `__tests__/README.md` "Tests are currently in development" versus `README.md` "High test coverage" (contradiction 38).
7. Whether a pull request must list its migrations, index changes and new environment variables.
8. Reviewer, operator and release approver role titles.
9. Whether Vercel deploys automatically from `main` or manually.
10. Post-release checks beyond `/api/health`.
11. Exact EAS build and submit commands for eMCR, and whether a Play testing track or staged rollout is used.
12. Release plan for MyClinicSoft Rep (EAS project not yet created) and for eMCR on iOS (contradiction 28).
13. General rollback procedure for code (Vercel previous deployment or revert) and for mobile releases.
14. Approver role and limit for each change type in "Change approvals".
15. On-call arrangement, incident channel and hand-over notes; whether the proposed minimum hand-over record is agreed.
16. `.github/copilot-instructions.md` is out of date: it says "`npm run install:setup`" and "Use `vitest` or `jest`", while `README.md` and `ci.yml` use pnpm only and `__tests__/README.md` says "Jest is not used" (contradictions 38 and 41). `AUDIT.md` (2026-04-04) is largely obsolete (PayPal, Nodemailer, Socket.IO, Jest, `middleware.ts` advice; contradictions 35, 36, 37).
17. `README.md` mentions "Next.js 16.0.3" in Known Issues, while `package.json` requires `next` ^16.4.1 (contradiction 65); and `README.md` says "License MIT" while the terms page says DevCom Digital owns the software (contradiction 40).
