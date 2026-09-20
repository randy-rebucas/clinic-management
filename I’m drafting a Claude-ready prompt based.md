I’m drafting a Claude-ready prompt based on the mobile audit and roadmap so you can reuse it directly for planning or implementation.

## Claude prompt

Use this prompt in Claude:

> You are a senior product and engineering architect working on a clinic management platform. The app is a Next.js 16 web application with MongoDB, multitenant architecture, patient management, appointments, billing, prescriptions, lab results, documents, queue management, and staff workflows. It already has a strong backend and web admin foundation, but it is not yet designed as a native mobile app.
>
> Your task is to produce a practical mobile roadmap and technical plan for this product.
>
> First, assess the current codebase and architecture. Use the existing app as the foundation for the backend and web admin layer, but design a separate mobile strategy for patient and staff use.
>
> Evaluate:
> - Product fit for mobile
> - Recommended mobile stack
> - MVP scope
> - Architecture choices
> - Authentication strategy
> - API readiness
> - Offline-first capability
> - Notifications and secure document access
> - Risk areas and constraints
>
> Recommended default direction:
> - Keep the existing web app as the admin/operations platform
> - Build a separate patient mobile app first
> - Optionally build a staff/doctor quick-access app later
> - Use React Native with Expo as the preferred stack
> - Reuse backend APIs where possible, but add a dedicated mobile-first API contract and auth model
>
> Focus on business reality:
> - The app is feature-rich and domain-strong
> - It already has some PWA patterns and web push capabilities
> - It is not yet a native-mobile-ready codebase
> - The biggest gaps are mobile-specific auth, offline sync, push notification architecture, and mobile UX separation from desktop admin UX
>
> Deliver:
>
> 1. Executive summary
> 2. Recommended mobile product strategy
> 3. Best technical architecture
> 4. MVP feature list for patient app
> 5. Phase-by-phase roadmap with estimated sequencing
> 6. Required backend changes before mobile launch
> 7. Risks and mitigations
> 8. Recommended next actions in order
>
> Be opinionated but practical. Prefer implementation realism over hype. Include specific recommendations for:
> - auth flow
> - API versioning
> - device/session tracking
> - push notifications
> - offline caching
> - document access
> - role-based mobile access
> - app architecture for iOS and Android
>
> Structure your answer clearly, with headings and concise but detailed guidance. The output should be suitable for a product owner and engineering lead to review together.
>
> Keep the final recommendation grounded in the fact that this project is a clinic management platform with strong operational depth, but not yet a mobile-first architecture.

If you want, I can also turn this into:
- a shorter one-paragraph version for Claude Code
- a more aggressive product strategy prompt
- or a full implementation prompt for generating the actual mobile architecture and backlog.