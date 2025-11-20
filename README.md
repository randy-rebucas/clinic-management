# Clinic Management System

A modern clinic management application built with Next.js 16 and MongoDB.

## Features

- **Patient Management**: Add, edit, and manage patient records with complete medical information
- **Doctor Management**: Manage doctor profiles with specializations and schedules
- **Appointment Scheduling**: Schedule and manage appointments between patients and doctors
- **Dashboard**: Overview of clinic statistics and quick actions

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Styling**: Tailwind CSS
- **UI**: Modern, responsive design

## Getting Started

### Prerequisites

- Node.js 20.9 or higher
- MongoDB (local or MongoDB Atlas)

### Installation

1. Clone or navigate to the project directory:
   ```bash
   cd clinic-management
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env.local`
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

5. Run the development server:
   ```bash
   npm run dev
   ```

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

## MongoDB Setup

### Option 1: MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string
4. Update `MONGODB_URI` in `.env.local`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/clinic-management?retryWrites=true&w=majority
   ```

### Option 2: Local MongoDB

1. Install MongoDB locally
2. Start MongoDB service
3. Update `MONGODB_URI` in `.env.local`:
   ```
   MONGODB_URI=mongodb://localhost:27017/clinic-management
   ```

## Project Structure

```
clinic-management/
├── app/
│   ├── api/              # API routes
│   │   ├── appointments/
│   │   ├── doctors/
│   │   └── patients/
│   ├── appointments/     # Appointments page
│   ├── doctors/          # Doctors page
│   ├── patients/        # Patients page
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Dashboard
├── components/           # React components
│   ├── Navigation.tsx
│   └── PatientForm.tsx
├── lib/                  # Utilities
│   └── mongodb.ts        # MongoDB connection
├── models/               # Mongoose models
│   ├── Appointment.ts
│   ├── Doctor.ts
│   └── Patient.ts
└── public/               # Static assets
```

## API Routes

### Patients
- `GET /api/patients` - Get all patients
- `POST /api/patients` - Create a new patient
- `GET /api/patients/[id]` - Get a specific patient
- `PUT /api/patients/[id]` - Update a patient
- `DELETE /api/patients/[id]` - Delete a patient

### Doctors
- `GET /api/doctors` - Get all doctors
- `POST /api/doctors` - Create a new doctor

### Appointments
- `GET /api/appointments` - Get all appointments (supports query params: date, doctorId, patientId)
- `POST /api/appointments` - Create a new appointment
- `GET /api/appointments/[id]` - Get a specific appointment
- `PUT /api/appointments/[id]` - Update an appointment
- `DELETE /api/appointments/[id]` - Delete an appointment

## Development

```bash
# Create admin user (first time setup)
npm run setup:admin

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
