# MyClinicSoft

A comprehensive, modern clinic management application built with Next.js 16 and MongoDB. Features a complete patient management system, appointment scheduling, billing, prescriptions, lab results, and more.

## Features

### Core Features
- **Patient Management**: Complete patient records with medical history, demographics, and file management
- **Doctor & Staff Management**: Manage doctor profiles, specializations, schedules, and staff members
- **Appointment Scheduling**: Schedule and manage appointments with reminders and public booking
- **Dashboard**: Real-time overview of clinic statistics, appointments, and quick actions
- **Real-Time Updates**: WebSocket-based instant synchronization across all users and devices

### Clinical Features
- **Visit Management**: Clinical notes, diagnoses (ICD-10), and visit history
- **Prescription Management**: E-prescriptions with drug interaction checking and printing
- **Laboratory Results**: Lab test management with third-party integration and notifications
- **Referrals**: Patient referral tracking and management
- **Queue Management**: Patient queue system with QR codes and display screens

### Administrative Features
- **Billing & Invoices**: Complete billing system with payment tracking and receipts
- **Inventory Management**: Medicine and supply inventory tracking
- **Document Management**: Secure document storage with Cloudinary integration
- **Reports & Analytics**: Comprehensive reporting for consultations, income, demographics, and more
- **Audit Logging**: Complete audit trail for compliance and security
- **Membership & Loyalty**: Patient membership programs with points and referrals

### Additional Features
- **Notifications**: In-app notification system
- **Room Management**: Clinic room assignment and scheduling
- **Service Management**: Clinic services and pricing
- **Patient Portal**: Public booking and patient access portal
- **SMS Integration**: Twilio integration for appointment reminders and notifications
- **Email Integration**: Email notifications and communications
- **Security & Compliance**: PH DPA compliance, data encryption, and access controls

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Styling**: Tailwind CSS
- **UI**: Modern, responsive design with sidebar navigation
- **Authentication**: JWT-based session management
- **File Storage**: Cloudinary integration
- **SMS**: Twilio integration
- **Email**: SMTP support

## User Interface

The application features a modern sidebar navigation layout with:
- **Collapsible Sidebar**: Toggle sidebar to maximize screen space
- **Grouped Navigation**: Features organized by category (Core, Clinical, Administrative, etc.)
- **Responsive Design**: Mobile-friendly with adaptive layouts
- **User Profile**: Quick access to user info and logout
- **Dynamic Layout**: Content area adjusts based on sidebar state

### Available Pages

#### Core Pages
- `/` - Dashboard with statistics and quick actions
- `/login` - User login
- `/signup` - User registration
- `/book` - Public appointment booking

#### Patient Management
- `/patients` - Patient list and search
- `/patients/[id]` - Patient detail view with full medical history

#### Scheduling
- `/appointments` - Appointment calendar and management

#### Clinical
- `/visits` - Clinical visits/consultations list
- `/visits/[id]` - Visit detail with notes and diagnoses
- `/prescriptions` - Prescription management
- `/prescriptions/[id]` - Prescription detail and printing
- `/lab-results` - Laboratory test results
- `/referrals` - Patient referral tracking

#### Administrative
- `/doctors` - Doctor and staff management
- `/doctors/[id]` - Doctor profile and schedule
- `/invoices` - Billing and invoice management
- `/documents` - Document management
- `/inventory` - Medicine and supply inventory
- `/queue` - Patient queue management
- `/reports` - Reports and analytics dashboard

## Getting Started

### Prerequisites

- Node.js 20.9 or higher
- MongoDB (local or MongoDB Atlas)

### Installation

#### Quick Install (Recommended)

Run the automated installation script:

```bash
npm run install:setup
```

This script will:
- ✅ Check Node.js version
- ✅ Install dependencies
- ✅ Create `.env.local` file from template
- ✅ Validate environment variables
- ✅ Test MongoDB connection
- ✅ Optionally seed the database with sample data
- ✅ Optionally create an admin user

#### Manual Installation

1. Clone or navigate to the project directory:
   ```bash
   cd myclinicsoft
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local` (or the install script will create it)
   - Update `MONGODB_URI` with your MongoDB connection string
   - Add `SESSION_SECRET` (generate with: `openssl rand -base64 32`)
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and add your MongoDB connection string and session secret.
   
   > **Note**: According to [Next.js environment variables documentation](https://nextjs.org/docs/app/guides/environment-variables), `.env.local` is loaded after `.env` and takes precedence. It's also ignored by git, so your secrets stay safe.

4. Create the first admin user:
   ```bash
   npm run setup:admin
   ```
   This will prompt you to enter admin credentials (name, email, password).

5. Run the development server with WebSocket support:
   ```bash
   npm run dev
   ```
   
   This starts the custom Next.js server with WebSocket support for real-time updates.
   
   > **Note**: For the old polling-based system (legacy), use `npm run dev:polling`

6. Open [http://localhost:3000](http://localhost:3000) in your browser and log in with your admin credentials

## Environment Variables

This project uses Next.js environment variables. According to the [Next.js documentation](https://nextjs.org/docs/app/guides/environment-variables), environment variables are loaded in the following order:

1. `process.env`
2. `.env.$(NODE_ENV).local` (e.g., `.env.development.local`)
3. `.env.local` (Not checked when `NODE_ENV` is `test`)
4. `.env.$(NODE_ENV)` (e.g., `.env.development`)
5. `.env`

**Important Notes:**
- `.env.local` is ignored by git (via `.gitignore`) and should contain your actual secrets
- `.env.example` is committed to git and serves as a template
- Never commit `.env.local` or any file with actual secrets
- Restart your Next.js development server after changing environment variables

### Required Environment Variables

- `MONGODB_URI` - Your MongoDB connection string (required)
- `SESSION_SECRET` - Secret key for encrypting session tokens (required)
  - Generate a secure random string: `openssl rand -base64 32`
  - Or use any long random string for development

### Optional Environment Variables

#### SMS (Twilio)
- `TWILIO_ACCOUNT_SID` - Twilio Account SID for SMS functionality
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token for SMS functionality
- `TWILIO_PHONE_NUMBER` - Twilio phone number (e.g., +1234567890)

#### Email
- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - Default sender email address

#### Cloudinary (Document Storage)
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

#### Cron Jobs
- `CRON_SECRET` - Secret token for authenticating cron job requests (generate with: `openssl rand -base64 32`)

#### Encryption
- `ENCRYPTION_KEY` - Key for encrypting sensitive data (generate with: `openssl rand -base64 32`)

#### Monitoring (Sentry)
- `SENTRY_DSN` - Sentry DSN for error tracking and performance monitoring (optional)

**Notes:**
- SMS functionality will work without Twilio credentials but will only log messages. To enable actual SMS sending, sign up at [Twilio](https://www.twilio.com) and add your credentials.
- Email functionality requires SMTP configuration. Without it, emails will only be logged.
- Cloudinary is used for document storage and image management. Without it, document uploads may be limited.

## MongoDB Setup

### Option 1: MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string
4. Update `MONGODB_URI` in `.env.local`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/myclinicsoft?retryWrites=true&w=majority
   ```

### Option 2: Local MongoDB

1. Install MongoDB locally
2. Start MongoDB service
3. Update `MONGODB_URI` in `.env.local`:
   ```
   MONGODB_URI=mongodb://localhost:27017/myclinicsoft
   ```

## Project Structure

```
myclinicsoft/
├── app/
│   ├── api/                    # API routes
│   │   ├── appointments/       # Appointment management
│   │   ├── audit-logs/         # Audit logging
│   │   ├── backups/            # Data backups
│   │   ├── communications/     # SMS/Email
│   │   ├── compliance/         # Data compliance
│   │   ├── cron/               # Scheduled tasks
│   │   ├── doctors/            # Doctor management
│   │   ├── documents/          # Document management
│   │   ├── inventory/          # Inventory management
│   │   ├── invoices/           # Billing & payments
│   │   ├── lab-results/        # Laboratory results
│   │   ├── memberships/        # Membership & loyalty
│   │   ├── notifications/      # Notifications
│   │   ├── patients/           # Patient management
│   │   ├── prescriptions/      # Prescription management
│   │   ├── queue/              # Queue management
│   │   ├── referrals/          # Referrals
│   │   ├── reports/            # Reports & analytics
│   │   ├── rooms/              # Room management
│   │   ├── services/           # Service management
│   │   ├── staff/              # Staff management
│   │   └── visits/             # Visit management
│   ├── appointments/           # Appointments page
│   ├── book/                   # Public booking page
│   ├── doctors/                # Doctors pages
│   ├── documents/              # Documents page
│   ├── inventory/              # Inventory page
│   ├── invoices/               # Invoices page
│   ├── lab-results/            # Lab results page
│   ├── login/                  # Login page
│   ├── patients/               # Patients pages
│   ├── prescriptions/          # Prescriptions pages
│   ├── queue/                  # Queue page
│   ├── referrals/              # Referrals page
│   ├── reports/                # Reports page
│   ├── signup/                 # Signup page
│   ├── visits/                 # Visits pages
│   ├── layout.tsx              # Root layout with sidebar
│   └── page.tsx                # Dashboard
├── components/                 # React components
│   ├── Sidebar.tsx             # Sidebar navigation
│   ├── SidebarContext.tsx      # Sidebar state management
│   ├── LayoutWrapper.tsx       # Layout wrapper
│   ├── Navigation.tsx          # Navigation component
│   ├── *PageClient.tsx         # Client components for pages
│   └── *Form.tsx               # Form components
├── lib/                        # Utilities
│   ├── dal.ts                  # Data access layer
│   ├── auth-helpers.ts         # Authentication helpers
│   ├── audit.ts                # Audit logging
│   ├── cloudinary.ts           # Cloudinary integration
│   ├── email.ts                # Email service
│   ├── sms.ts                  # SMS service
│   ├── notifications.ts        # Notification service
│   ├── permissions.ts          # Permission system
│   ├── encryption.ts           # Data encryption
│   └── middleware/             # Custom middleware
├── models/                     # Mongoose models
│   ├── Appointment.ts
│   ├── AuditLog.ts
│   ├── Doctor.ts
│   ├── Document.ts
│   ├── Imaging.ts
│   ├── Invoice.ts
│   ├── Inventory.ts
│   ├── LabResult.ts
│   ├── Membership.ts
│   ├── Notification.ts
│   ├── Patient.ts
│   ├── Pharmacy.ts
│   ├── Prescription.ts
│   ├── Queue.ts
│   ├── Referral.ts
│   ├── Room.ts
│   ├── Service.ts
│   ├── User.ts
│   └── Visit.ts
└── public/                     # Static assets
```

## API Routes

### Patients
- `GET /api/patients` - Get all patients
- `POST /api/patients` - Create a new patient
- `GET /api/patients/[id]` - Get a specific patient
- `PUT /api/patients/[id]` - Update a patient
- `DELETE /api/patients/[id]` - Delete a patient
- `POST /api/patients/[id]/upload` - Upload patient files
- `GET /api/patients/[id]/outstanding-balance` - Get outstanding balance
- `GET /api/patients/[id]/alerts` - Get patient alerts

### Doctors
- `GET /api/doctors` - Get all doctors
- `POST /api/doctors` - Create a new doctor
- `GET /api/doctors/[id]` - Get doctor details
- `PUT /api/doctors/[id]` - Update doctor
- `GET /api/doctors/[id]/schedule` - Get doctor schedule
- `GET /api/doctors/[id]/productivity` - Get doctor productivity
- `GET /api/doctors/productivity` - Get all doctors productivity

### Appointments
- `GET /api/appointments` - Get all appointments (supports query params: date, doctorId, patientId)
- `POST /api/appointments` - Create a new appointment
- `GET /api/appointments/[id]` - Get a specific appointment
- `PUT /api/appointments/[id]` - Update an appointment
- `DELETE /api/appointments/[id]` - Delete an appointment
- `GET /api/appointments/public` - Public appointment availability
- `POST /api/appointments/reminders/sms` - Send SMS reminders

### Visits
- `GET /api/visits` - Get all visits
- `POST /api/visits` - Create a new visit
- `GET /api/visits/[id]` - Get a specific visit
- `PUT /api/visits/[id]` - Update a visit
- `POST /api/visits/[id]/upload` - Upload visit documents
- `GET /api/visits/[id]/print/medical-certificate` - Print medical certificate
- `GET /api/visits/[id]/print/lab-request` - Print lab request form

### Prescriptions
- `GET /api/prescriptions` - Get all prescriptions
- `POST /api/prescriptions` - Create a new prescription
- `GET /api/prescriptions/[id]` - Get a specific prescription
- `PUT /api/prescriptions/[id]` - Update a prescription
- `POST /api/prescriptions/[id]/dispense` - Mark as dispensed
- `GET /api/prescriptions/[id]/print` - Print prescription
- `POST /api/prescriptions/check-interactions` - Check drug interactions

### Invoices
- `GET /api/invoices` - Get all invoices
- `POST /api/invoices` - Create a new invoice
- `GET /api/invoices/[id]` - Get a specific invoice
- `PUT /api/invoices/[id]` - Update an invoice
- `DELETE /api/invoices/[id]` - Delete an invoice
- `POST /api/invoices/[id]/payment` - Record payment
- `GET /api/invoices/[id]/receipt` - Get receipt
- `GET /api/invoices/outstanding` - Get outstanding invoices

### Lab Results
- `GET /api/lab-results` - Get all lab results
- `POST /api/lab-results` - Create a new lab result
- `GET /api/lab-results/[id]` - Get a specific lab result
- `PUT /api/lab-results/[id]` - Update a lab result
- `DELETE /api/lab-results/[id]` - Delete a lab result
- `POST /api/lab-results/[id]/upload` - Upload lab results
- `POST /api/lab-results/[id]/notify` - Notify patient
- `GET /api/lab-results/[id]/request-form` - Get request form
- `POST /api/lab-results/third-party/send` - Send to third party
- `POST /api/lab-results/third-party/webhook` - Third party webhook

### Documents
- `GET /api/documents` - Get all documents
- `POST /api/documents` - Create/upload a document
- `GET /api/documents/[id]` - Get a specific document
- `PUT /api/documents/[id]` - Update a document
- `DELETE /api/documents/[id]` - Delete a document
- `GET /api/documents/[id]/download` - Download document
- `GET /api/documents/[id]/view` - View document
- `POST /api/documents/scan` - Scan document

### Queue
- `GET /api/queue` - Get queue entries
- `POST /api/queue` - Add to queue
- `GET /api/queue/[id]` - Get queue entry
- `PUT /api/queue/[id]` - Update queue entry
- `PATCH /api/queue/[id]/vitals` - Update vital signs (BP, HR, RR, temp, SpO2, height, weight, BMI)
- `DELETE /api/queue/[id]` - Remove from queue
- `GET /api/queue/[id]/qr-code` - Get QR code
- `POST /api/queue/check-in` - Check in patient
- `GET /api/queue/display` - Get display data (for TV screens)

### Referrals
- `GET /api/referrals` - Get all referrals
- `POST /api/referrals` - Create a new referral
- `GET /api/referrals/[id]` - Get a specific referral
- `PUT /api/referrals/[id]` - Update a referral
- `DELETE /api/referrals/[id]` - Delete a referral

### Inventory
- `GET /api/inventory` - Get all inventory items
- `POST /api/inventory` - Create inventory item
- `GET /api/inventory/[id]` - Get inventory item
- `PUT /api/inventory/[id]` - Update inventory item
- `DELETE /api/inventory/[id]` - Delete inventory item

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics
- `GET /api/reports/consultations` - Consultation reports
- `GET /api/reports/demographics` - Demographics reports
- `GET /api/reports/income` - Income reports
- `GET /api/reports/inventory` - Inventory reports
- `GET /api/reports/hmo-claims` - HMO claims reports

### Other APIs
- `GET /api/notifications` - Get notifications
- `GET /api/notifications/unread-count` - Get unread count
- `POST /api/notifications/mark-all-read` - Mark all as read
- `GET /api/memberships` - Get memberships
- `POST /api/memberships/[id]/points` - Update points
- `GET /api/rooms` - Get rooms
- `GET /api/services` - Get services
- `GET /api/staff` - Get staff members
- `GET /api/audit-logs` - Get audit logs
- `GET /api/audit-logs/patient-access` - Get patient access logs

## Data Models

The application uses MongoDB with Mongoose for data modeling. Key models include:

- **Patient** - Patient demographics, medical history, and records
- **User** - User accounts with role-based access control
- **Doctor** - Doctor profiles with specializations and schedules
- **Appointment** - Appointment scheduling and management
- **Visit** - Clinical visits with diagnoses (ICD-10) and notes
- **Prescription** - E-prescriptions with drug interaction checking
- **Invoice** - Billing and payment tracking
- **LabResult** - Laboratory test results
- **Document** - Document storage and management
- **Queue** - Patient queue management
- **Referral** - Patient referral tracking
- **Inventory** - Medicine and supply inventory
- **Membership** - Patient membership and loyalty programs
- **Notification** - In-app notifications
- **AuditLog** - Audit trail for compliance
- **Room** - Clinic room management
- **Service** - Clinic services and pricing

All models include proper relationships, indexes, and validation. See `models/RELATIONSHIPS.md` for detailed relationship documentation.

## Documentation

Additional documentation is available in the `docs/` directory:

- `BILLING_PAYMENTS.md` - Billing and payment system documentation
- `CLOUDINARY_SETUP.md` - Cloudinary integration guide
- `CRON_SETUP.md` - Scheduled tasks and cron jobs
- `DASHBOARD_REPORTING.md` - Reporting features
- `DOCUMENT_MANAGEMENT.md` - Document management system
- `EPRESCRIPTION.md` - E-prescription features
- `LABORATORY_DIAGNOSTIC.md` - Lab results and diagnostics
- `MEMBERSHIP_LOYALTY.md` - Membership and loyalty programs
- `NOTIFICATIONS_COMMUNICATION.md` - Notifications and communications
- `ROOM_MANAGEMENT.md` - Room management system
- `SECURITY_COMPLIANCE.md` - Security and compliance features
- `SMS_SETUP.md` - SMS integration setup
- `STAFF_DOCTOR_MANAGEMENT.md` - Staff and doctor management

## Development

```bash
# First time setup (automated installation)
npm run install:setup

# Create admin user (if not done during install)
npm run setup:admin

# Seed database with sample data (optional)
npm run seed

# Run development server (with Turbopack - faster)
npm run dev

# Run development server (with Webpack - no source map warnings)
npm run dev:webpack

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

### Known Issues

**Source Map Warning in Development:**
- When using `npm run dev` (Turbopack), you may see "Invalid source map" warnings in the console
- This is a known Turbopack issue in Next.js 16.0.3 and does **not** affect functionality
- The application works correctly despite this warning
- **Workaround:** Use `npm run dev:webpack` to avoid the warning (slower but no warnings)
- This issue only affects development mode - production builds are not affected

## License

MIT
