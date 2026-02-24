# Customizable Notification Templates Plan

1. Store notification/email/SMS templates in database or config files.
2. Add admin UI for editing templates (subject, body, variables).
3. Use template engine (e.g., handlebars, mustache) for dynamic content.
4. Reference templates in notification/email/SMS sending logic.
5. Document template management in docs/NOTIFICATION_TEMPLATES.md.

Example:
- Template variables: {{patientName}}, {{appointmentDate}}, etc.
- Admin can preview and edit templates.

Next steps:
- Scaffold template storage and UI
- Integrate with notification logic
- Document feature
