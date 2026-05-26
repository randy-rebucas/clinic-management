# Multi-Tenancy Documentation Index

**Project:** MyClinicsoftSoft  
**Last updated:** 2026-04-23

---

## Documentation Overview

The multi-tenancy implementation for MyClinicsoftSoft is documented across four comprehensive guides:

### 📘 [MULTI_TENANCY.md](./MULTI_TENANCY.md) — Complete Reference
**Purpose:** Comprehensive architectural and technical reference  
**Audience:** Architects, senior developers, system designers  
**Content:**
- Complete architecture overview
- Tenant model & schema details
- Subdomain resolution logic
- Session & cookie strategy
- Data isolation patterns
- Tenant onboarding & subscription
- All CLI scripts
- Environment variables
- Known issues & gaps
- Key file reference

**Start here if:** You need to understand the entire system or make architectural decisions

---

### ⚡ [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) — Developer Guide
**Purpose:** Practical quick-start guide for developers  
**Audience:** Developers adding features or fixing bugs  
**Content:**
- Common task patterns (get tenant, query, create)
- Local development setup
- Creating/deleting tenants
- Common patterns (guarded routes, patient queries)
- Testing scenarios
- Adding tenant support to new models
- Debugging multi-tenant issues
- Performance notes
- Security checklist
- Environment variables checklist

**Start here if:** You're new to the project or need to implement a multi-tenant feature

---

### 🔒 [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) — Security Deep Dive
**Purpose:** Understand isolation guarantees, threats, and security model  
**Audience:** Security team, architects, code reviewers  
**Content:**
- Isolation guarantees (4 layers)
- Threat model (7 scenarios)
- Data access control patterns
- Cross-tenant exposure risks
- Authentication & session isolation
- Authorization & permissions
- Resource limits & quotas
- Audit logging
- Security checklist (40+ items)
- Incident response procedures

**Start here if:** You're doing security review, threat modeling, or investigating a data breach

---

### 💻 [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md) — Code Examples
**Purpose:** Practical code patterns and examples  
**Audience:** Developers implementing features  
**Content:**
- 4 API route patterns (GET, POST, PATCH, DELETE)
- 6 database query patterns
- 3 server component patterns
- 2 error handling patterns
- 2 testing patterns
- 2 migration patterns
- 3 performance patterns

**Start here if:** You need copy-paste code examples for your implementation

---

## Quick Navigation by Task

### I'm a new developer, what do I read?
1. Start: [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) (10 min read)
2. Setup: Follow "Development Workflow" section
3. Deep dive: [MULTI_TENANCY.md](./MULTI_TENANCY.md) sections 1-5 (20 min)
4. Coding: [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md)

### I need to add a new model/feature with tenant support
1. Quick reference: [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) → "Adding Tenant Support to New Models"
2. Code examples: [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md) → Pattern 1.2 (POST) + Pattern 2.1
3. Security: [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) → Section 9 (Security Checklist)

### I found a data isolation bug, what do I do?
1. Identify: [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) → Section 4 (Cross-Tenant Data Exposure Risks)
2. Fix: [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md) → Sections 1-2
3. Verify: [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) → "Debugging Multi-Tenant Issues"
4. Test: [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md) → Section 5.1 (Test Tenant Isolation)

### I'm doing a security review
1. Read: [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) (entire, 30 min)
2. Check: Section 9 → Security Checklist
3. Verify: Section 4 → Cross-Tenant Data Exposure Risks
4. Reference: [MULTI_TENANCY.md](./MULTI_TENANCY.md) → Section 14 (Known Issues & Gaps)

### I need to debug a tenant-related issue
1. Symptoms: [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) → "Debugging Multi-Tenant Issues"
2. Understanding: [MULTI_TENANCY.md](./MULTI_TENANCY.md) → Section 3 (Subdomain Resolution)
3. Patterns: [MULTI_TENANCY_CODE_PATTERNS.md](./MULTI_TENANCY_CODE_PATTERNS.md) → Database Query Patterns
4. Security: [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) → Section 2 (Threat Model)

### I'm setting up a new environment (staging, production)
1. Reference: [MULTI_TENANCY.md](./MULTI_TENANCY.md) → Section 13 (Environment Variables)
2. Checklist: [TENANT_ISOLATION_SECURITY.md](./TENANT_ISOLATION_SECURITY.md) → Section 9 (Configuration Checklist)
3. Quick start: [MULTI_TENANCY_QUICK_START.md](./MULTI_TENANCY_QUICK_START.md) → "Setup"

---

## Section Cross-Reference

### Architecture & Design
- [MULTI_TENANCY.md → Section 1](./MULTI_TENANCY.md#1-architecture-overview) — Architecture Overview
- [MULTI_TENANCY.md → Section 2](./MULTI_TENANCY.md#2-tenant-model) — Tenant Model
- [TENANT_ISOLATION_SECURITY.md → Section 1](./TENANT_ISOLATION_SECURITY.md#1-isolation-guarantees) — Isolation Guarantees

### Configuration & Setup
- [MULTI_TENANCY_QUICK_START.md → Setup](./MULTI_TENANCY_QUICK_START.md#setup) — Development Setup
- [MULTI_TENANCY.md → Section 13](./MULTI_TENANCY.md#13-environment-variables) — Environment Variables
- [TENANT_ISOLATION_SECURITY.md → Section 9](./TENANT_ISOLATION_SECURITY.md#9-security-checklist) — Configuration Checklist

### Implementation & Code
- [MULTI_TENANCY_CODE_PATTERNS.md → Section 1](./MULTI_TENANCY_CODE_PATTERNS.md#1-api-route-patterns) — API Route Patterns
- [MULTI_TENANCY_CODE_PATTERNS.md → Section 2](./MULTI_TENANCY_CODE_PATTERNS.md#2-database-query-patterns) — Database Query Patterns
- [MULTI_TENANCY_QUICK_START.md → Common Patterns](./MULTI_TENANCY_QUICK_START.md#common-patterns) — Common Patterns

### Security & Isolation
- [TENANT_ISOLATION_SECURITY.md → Section 2](./TENANT_ISOLATION_SECURITY.md#2-threat-model) — Threat Model (7 scenarios)
- [TENANT_ISOLATION_SECURITY.md → Section 4](./TENANT_ISOLATION_SECURITY.md#4-cross-tenant-data-exposure-risks) — Exposure Risks
- [TENANT_ISOLATION_SECURITY.md → Section 9](./TENANT_ISOLATION_SECURITY.md#9-security-checklist) — Security Checklist

### Troubleshooting & Debugging
- [MULTI_TENANCY_QUICK_START.md → Debugging](./MULTI_TENANCY_QUICK_START.md#debugging-multi-tenant-issues) — Debug Guide
- [TENANT_ISOLATION_SECURITY.md → Section 10](./TENANT_ISOLATION_SECURITY.md#10-incident-response) — Incident Response

### Testing & Quality
- [MULTI_TENANCY_CODE_PATTERNS.md → Section 5](./MULTI_TENANCY_CODE_PATTERNS.md#5-testing-patterns) — Testing Patterns
- [MULTI_TENANCY_QUICK_START.md → Testing](./MULTI_TENANCY_QUICK_START.md#testing-multi-tenancy) — Manual Testing

### Operations & Maintenance
- [MULTI_TENANCY.md → Section 12](./MULTI_TENANCY.md#12-cli-scripts) — CLI Scripts
- [MULTI_TENANCY_CODE_PATTERNS.md → Section 6](./MULTI_TENANCY_CODE_PATTERNS.md#6-migration-patterns) — Migration Patterns

---

## Key Files in the Codebase

### Core Tenant Utilities
| File | Purpose | Read For |
|---|---|---|
| `lib/tenant.ts` | Subdomain extraction, tenant resolution | How tenants are identified |
| `lib/tenant-query.ts` | Query helpers (mostly unused) | Tenant filter utilities |
| `app/lib/dal.ts` | Session creation & verification | JWT structure, tenantId embedding |
| `models/Tenant.ts` | Tenant schema | Model structure |

### API Routes
| File | Purpose | Read For |
|---|---|---|
| `app/api/tenants/onboard/route.ts` | Tenant creation | Onboarding flow |
| `app/api/tenants/public/route.ts` | Tenant lookup | Public tenant API |
| `app/api/subscription/` | Billing & subscription | Payment handling |
| `app/api/audit-logs/route.ts` | Audit log queries | Tenant-scoped logging |

### Configuration & Middleware
| File | Purpose | Read For |
|---|---|---|
| `proxy.ts` | Edge middleware (CSRF, cron auth) | Security features |
| `.env.example` | Environment variable template | Configuration |

### Scripts
| File | Purpose | Run With |
|---|---|---|
| `scripts/onboard-tenant.ts` | Interactive tenant creation | `npm run tenant:onboard` |
| `scripts/delete-tenant.ts` | Tenant deletion | `npm run tenant:delete` |
| `scripts/seed-data.ts` | Demo data generation | `npm run seed` |

---

## Common Questions & Answers

### Q: How does a request know which tenant it belongs to?
**A:** Through subdomain extraction. The `Host` header is parsed to extract the subdomain (e.g., "clinic-a" from "clinic-a.myclinicsoft.com"), then looked up in the Tenant collection.

**Read:** [MULTI_TENANCY.md → Section 3](./MULTI_TENANCY.md#3-subdomain-resolution)  
**Code:** `lib/tenant.ts` → `extractSubdomain()`, `getTenantContext()`

---

### Q: Can a patient belong to multiple clinics?
**A:** Yes. The Patient model uses `tenantIds` (array) instead of `tenantId` (single). This allows patients to be shared across clinics they've visited.

**Read:** [MULTI_TENANCY.md → Section 5](./MULTI_TENANCY.md#special-case--patienttenantids-array)  
**Pattern:** [MULTI_TENANCY_CODE_PATTERNS.md → Pattern 2.2](./MULTI_TENANCY_CODE_PATTERNS.md#pattern-22-multi-tenant-patient-query)

---

### Q: What happens if I forget to filter by tenantId?
**A:** Data from all clinics is returned. This is a critical security bug.

**Read:** [TENANT_ISOLATION_SECURITY.md → Section 4.1](./TENANT_ISOLATION_SECURITY.md#risk-1-missing-tenantid-filter-in-query)  
**Debug:** [MULTI_TENANCY_QUICK_START.md → Debugging](./MULTI_TENANCY_QUICK_START.md#issue-data-visible-across-tenants)

---

### Q: How are sessions scoped to tenants?
**A:** The JWT token contains a `tenantId` field. When a staff member logs in from a subdomain, their tenant is embedded in the token. All subsequent requests include the tenantId from the JWT.

**Read:** [MULTI_TENANCY.md → Section 4](./MULTI_TENANCY.md#4-session--cookie-strategy)  
**Deep dive:** [TENANT_ISOLATION_SECURITY.md → Section 5](./TENANT_ISOLATION_SECURITY.md#5-authentication--session-isolation)

---

### Q: What's the difference between `COOKIE_DOMAIN` and `ROOT_DOMAIN`?
**A:**
- `ROOT_DOMAIN` (e.g., "myclinicsoft.com") — Extracted to identify subdomains
- `COOKIE_DOMAIN` (e.g., ".myclinicsoft.com") — Allows cookies to be shared across subdomains

**Read:** [MULTI_TENANCY.md → Section 13](./MULTI_TENANCY.md#13-environment-variables)  
**Details:** [MULTI_TENANCY.md → Section 4](./MULTI_TENANCY.md#cross-subdomain-cookies)

---

### Q: How do I test tenant isolation?
**A:** Create test documents with different tenantIds, then verify that queries with one tenantId don't return documents from other tenants.

**Read:** [MULTI_TENANCY_CODE_PATTERNS.md → Section 5.1](./MULTI_TENANCY_CODE_PATTERNS.md#pattern-51-test-tenant-isolation)  
**Manual test:** [MULTI_TENANCY_QUICK_START.md → Testing](./MULTI_TENANCY_QUICK_START.md#manual-test-scenario)

---

### Q: What are the known issues with multi-tenancy?
**A:** There are 8 documented issues (1 critical, 3 moderate, 4 minor):
- `proxy.ts` not wired as middleware (CSRF protection inactive)
- Some API routes use non-existent schema fields
- `addTenantFilter` helpers unused

**Read:** [MULTI_TENANCY.md → Section 14](./MULTI_TENANCY.md#14-known-issues--gaps)

---

### Q: How do I add tenant support to a new model?
**A:** Add a `tenantId` field to the schema, filter all queries by it, and ensure the model is deleted in `delete-tenant.ts`.

**Read:** [MULTI_TENANCY_QUICK_START.md → Adding Tenant Support](./MULTI_TENANCY_QUICK_START.md#adding-tenant-support-to-new-models)

---

## Document Maintenance

- **Last reviewed:** 2026-04-23
- **Last updated:** 2026-04-23
- **Maintainers:** Clinic Management System Team
- **Review frequency:** Quarterly (or after major features)

### How to Update These Docs

1. **Found an error or outdated info?** Update the relevant doc file
2. **New feature added?** Add a pattern to `MULTI_TENANCY_CODE_PATTERNS.md`
3. **New security consideration?** Add to `TENANT_ISOLATION_SECURITY.md`
4. **Fixed a known issue?** Remove from `MULTI_TENANCY.md` Section 14

---

## Additional Resources

### External References
- [OWASP Multi-Tenancy Guidelines](https://owasp.org/www-project-cloud-security/)
- [MongoDB Multi-Tenancy Best Practices](https://www.mongodb.com/docs/manual/security/#multi-tenant-data-isolation)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

### Related Docs in Project
- `README.md` — Project overview
- `models/RELATIONSHIPS.md` — Data model relationships
- `docs/SECURITY.md` — General security (if exists)
- `docs/BILLING_AND_INVOICING.md` — Subscription/billing context

---

*Navigation aid for MyClinicsoftSoft multi-tenancy documentation*
