# Clinic Management System - Documentation

Welcome to the comprehensive documentation for the Clinic Management System. This documentation covers all aspects of the system, from getting started to advanced multi-tenant architecture.

---

## 📚 Table of Contents

### Getting Started
- [Getting Started Guide](./GETTING_STARTED.md) - Installation, setup, and first steps
- [SMS and Email Setup](./SMS_AND_EMAIL_SETUP.md) - Configure communication services
- [Cloudinary Document Storage](./CLOUDINARY_DOCUMENT_STORAGE.md) - Set up document storage

### Multi-Tenant Architecture
- [**Multi-Tenant Architecture** (Main Documentation)](./MULTI_TENANT_ARCHITECTURE.md) - Complete architectural overview
- [Multi-Tenant Quick Reference](./MULTI_TENANT_QUICK_REFERENCE.md) - Quick lookup guide and code snippets
- [Multi-Tenant Diagrams](./MULTI_TENANT_DIAGRAMS.md) - Visual representations and flow diagrams
- [Multi-Tenant Implementation Checklist](./MULTI_TENANT_IMPLEMENTATION_CHECKLIST.md) - Developer checklist for adding tenant support

### Core Features
- [Patient Management](./PATIENT_MANAGEMENT.md) - Patient registration, records, and history
- [Appointment Scheduling](./APPOINTMENT_SCHEDULING.md) - Booking and calendar management
- [Clinical Visits](./CLINICAL_VISITS.md) - Visit workflow and documentation
- [Electronic Prescription (ePrescription)](./EPRESCRIPTION.md) - Digital prescription management
- [Queue Management](./QUEUE_MANAGEMENT.md) - Patient queue and waiting room
- [Billing and Payments](./BILLING_PAYMENTS.md) - Invoice generation and payment processing
- [Inventory Management](./INVENTORY_MANAGEMENT.md) - Medicine and supplies tracking

### System Configuration
- [Settings Configuration](./SETTINGS_CONFIGURATION.md) - System-wide and tenant settings
- [Monitoring and Rate Limiting](./MONITORING_AND_RATE_LIMITING.md) - Performance and security

### User Guides
- [Complete Patient Journey](./USER_JOURNEY_COMPLETE_PATIENT_FLOW.md) - End-to-end patient flow
- [Staff Login Guide](../STAFF_LOGIN_GUIDE.md) - Login instructions for staff

---

## 🏥 Multi-Tenant Implementation

This system implements a **subdomain-based multi-tenant architecture** where each clinic/organization operates on its own subdomain while sharing the same application and database.

### Key Multi-Tenant Features

✅ **Subdomain Isolation**: Each tenant has a unique subdomain (e.g., `clinic1.example.com`)
✅ **Data Isolation**: All database queries are automatically filtered by tenant
✅ **Shared Infrastructure**: Cost-effective single database for all tenants
✅ **Trial Subscriptions**: Automatic 7-day trial for new tenants
✅ **Tenant-Scoped Authentication**: Users belong to specific tenants

### Multi-Tenant Documentation

For developers working with the multi-tenant architecture:

1. **Start here**: [Multi-Tenant Architecture](./MULTI_TENANT_ARCHITECTURE.md) - Read the complete architecture documentation
2. **Quick lookup**: [Quick Reference Guide](./MULTI_TENANT_QUICK_REFERENCE.md) - Code snippets and common patterns
3. **Visual learning**: [Architecture Diagrams](./MULTI_TENANT_DIAGRAMS.md) - Flow diagrams and visual representations
4. **Implementation**: [Implementation Checklist](./MULTI_TENANT_IMPLEMENTATION_CHECKLIST.md) - Step-by-step guide for adding tenant support

---

## 🚀 Quick Start

### For Users

1. **Create a Tenant**: Visit `https://yourapp.com/tenant-onboard` or run `npm run tenant:onboard`
2. **Access Your Clinic**: Navigate to `https://yourclinic.yourapp.com`
3. **Login**: Use the admin credentials created during onboarding
4. **Configure Settings**: Set up your clinic preferences in Settings
5. **Start Using**: Add patients, schedule appointments, manage visits

### For Developers

1. **Setup Environment**:
   ```bash
   cp .env.example .env.local
   # Configure your environment variables
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Installation Script**:
   ```bash
   npm run install
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

5. **Access Application**:
   - Root domain: `http://localhost:3000`
   - Tenant subdomain: `http://tenant1.localhost:3000`

---

## 📖 Feature Documentation

### Patient Management
Comprehensive patient registration, medical history, and record-keeping system.
- Patient registration with full demographics
- Medical history and allergies
- Emergency contacts
- Document attachments
- QR code login for patient portal

[Read Patient Management Docs →](./PATIENT_MANAGEMENT.md)

### Appointment Scheduling
Flexible appointment booking with calendar views and automated reminders.
- Multi-doctor scheduling
- Calendar views (day, week, month)
- SMS/Email reminders
- Status tracking
- Recurring appointments

[Read Appointment Scheduling Docs →](./APPOINTMENT_SCHEDULING.md)

### Clinical Visits
Complete visit workflow from check-in to discharge.
- Visit documentation
- SOAP notes
- Vital signs tracking
- Diagnosis and treatment plans
- Integration with prescriptions and lab orders

[Read Clinical Visits Docs →](./CLINICAL_VISITS.md)

### Electronic Prescription
Digital prescription management with medicine database.
- Medicine catalog
- Dosage and instructions
- Drug interaction checking
- Prescription history
- Print and export

[Read ePrescription Docs →](./EPRESCRIPTION.md)

### Queue Management
Patient queue tracking for efficient clinic flow.
- Real-time queue status
- Priority management
- Waiting time estimates
- Queue notifications
- Multiple queue support

[Read Queue Management Docs →](./QUEUE_MANAGEMENT.md)

### Billing and Payments
Complete billing system with invoicing and payment tracking.
- Invoice generation
- Payment processing
- Discount management (PWD, Senior, Membership)
- Payment history
- Financial reports

[Read Billing and Payments Docs →](./BILLING_PAYMENTS.md)

### Inventory Management
Track medicine and supplies inventory.
- Stock levels
- Reorder alerts
- Expiry tracking
- Usage reports
- Supplier management

[Read Inventory Management Docs →](./INVENTORY_MANAGEMENT.md)

---

## 🔧 System Configuration

### Settings Configuration
Configure system-wide and tenant-specific settings.
- Clinic information
- Business hours
- Appointment settings
- Notification preferences
- Integration settings

[Read Settings Configuration Docs →](./SETTINGS_CONFIGURATION.md)

### Monitoring and Rate Limiting
System monitoring and security features.
- Rate limiting
- Audit logging
- Performance monitoring
- Error tracking
- Security alerts

[Read Monitoring and Rate Limiting Docs →](./MONITORING_AND_RATE_LIMITING.md)

---

## 🔐 Authentication & Authorization

### Role-Based Access Control

The system implements role-based permissions:

- **Admin**: Full system access, user management, settings
- **Doctor**: Clinical features, prescriptions, patient management
- **Nurse**: Patient care, vitals, visit assistance
- **Receptionist**: Appointments, patient registration, queue
- **Accountant**: Billing, invoices, payments, reports
- **Medical Representative**: Inventory, medicine catalog

### Multi-Tenant Authentication

- Users belong to specific tenants
- Login is tenant-scoped (via subdomain)
- Session includes tenant context
- All operations filtered by tenant

---

## 🛠️ Development

### Adding Multi-Tenant Support to New Features

Follow the [Implementation Checklist](./MULTI_TENANT_IMPLEMENTATION_CHECKLIST.md) when:
- Creating new database models
- Adding API endpoints
- Building new pages/routes
- Implementing new features

### Code Standards

```typescript
// Always get tenant context in API routes
const tenantContext = await getTenantContext();
const tenantId = tenantContext.tenantId;

// Always filter queries by tenantId
const query = {
  tenantId: new Types.ObjectId(tenantId),
  status: 'active'
};

// Always validate tenant access
if (!tenantId) {
  return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
}
```

---

## 📊 Database

### Technology Stack

- **Database**: MongoDB (shared database, tenant-scoped collections)
- **ODM**: Mongoose
- **Indexing**: Compound indexes with tenantId

### Tenant-Scoped Collections

All collections include a `tenantId` field that references the Tenant model:

- Users, Roles, Permissions
- Patients, Appointments, Visits
- Prescriptions, Lab Results, Imaging
- Invoices, Payments, Memberships
- Documents, Referrals, Queue
- Medicine, Services, Rooms, Inventory
- Settings, Audit Logs, Notifications

---

## 🔒 Security

### Data Isolation

- **Query-Level Filtering**: All queries automatically filtered by tenantId
- **Middleware Protection**: Tenant verification in middleware
- **Session Validation**: Tenant context in user sessions
- **Cross-Tenant Prevention**: Multiple layers of protection

### Best Practices

✅ Always use `Types.ObjectId()` wrapper for tenantId
✅ Never trust tenantId from request body
✅ Always validate tenant context exists
✅ Use compound indexes with tenantId
✅ Filter populate operations by tenantId

❌ Don't allow tenantId updates
❌ Don't skip tenant validation
❌ Don't use global unique constraints
❌ Don't forget populate filters

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- api/patients

# Run with coverage
npm test -- --coverage
```

### Multi-Tenant Testing

Always test:
- ✅ Tenant isolation (user A cannot see user B's data)
- ✅ Cross-tenant access prevention
- ✅ Subscription enforcement
- ✅ Tenant-scoped queries
- ✅ Session tenant validation

---

## 🚀 Deployment

### Environment Variables

Required environment variables:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/clinic-db

# Session
SESSION_SECRET=your-secret-key-minimum-32-characters

# Multi-Tenant
ROOT_DOMAIN=yourdomain.com

# Optional: Integrations
SENDGRID_API_KEY=your-sendgrid-key
TWILIO_ACCOUNT_SID=your-twilio-sid
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
PAYPAL_CLIENT_ID=your-paypal-id
```

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] SSL certificate installed
- [ ] DNS configured (with wildcard for subdomains)
- [ ] Backup strategy implemented
- [ ] Monitoring enabled
- [ ] Rate limiting configured

---

## 📞 Support

### For Users

- Check the [User Guides](#user-guides) section
- Review the [Staff Login Guide](../STAFF_LOGIN_GUIDE.md)
- Contact your system administrator

### For Developers

- Review the [Multi-Tenant Architecture](./MULTI_TENANT_ARCHITECTURE.md)
- Check the [Quick Reference Guide](./MULTI_TENANT_QUICK_REFERENCE.md)
- Use the [Implementation Checklist](./MULTI_TENANT_IMPLEMENTATION_CHECKLIST.md)
- Search existing documentation
- Report issues on GitHub

---

## 📄 License

[Add your license information here]

---

## 🤝 Contributing

[Add contribution guidelines here]

---

**Documentation Version**: 1.0
**Last Updated**: January 2026

For the most up-to-date information on multi-tenant implementation, see the [Multi-Tenant Architecture Documentation](./MULTI_TENANT_ARCHITECTURE.md).
