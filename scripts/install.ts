import { config } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import mongoose from 'mongoose';
import readline from 'readline';
import { validateEnv } from '../lib/env-validation';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  };
  console.log(`${icons[type]} ${message}`);
}

function checkNodeVersion(): boolean {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major < 20) {
      log(`Node.js version ${version} detected. Node.js 20.9 or higher is required.`, 'error');
      return false;
    }
    log(`Node.js ${version} detected`, 'success');
    return true;
  } catch (error) {
    log('Could not detect Node.js version', 'error');
    return false;
  }
}

function checkDependencies(): boolean {
  try {
    if (!existsSync('node_modules')) {
      log('Dependencies not installed', 'warning');
      return false;
    }
    log('Dependencies installed', 'success');
    return true;
  } catch (error) {
    log('Could not check dependencies', 'error');
    return false;
  }
}

function installDependencies(): boolean {
  try {
    log('Installing dependencies (this may take a few minutes)...', 'info');
    execSync('npm install', { stdio: 'inherit' });
    log('Dependencies installed successfully', 'success');
    return true;
  } catch (error) {
    log('Failed to install dependencies', 'error');
    return false;
  }
}

function createEnvFile(): boolean {
  const envLocalPath = '.env.local';
  const envExamplePath = '.env.example';

  // Check if .env.local already exists
  if (existsSync(envLocalPath)) {
    log('.env.local already exists', 'info');
    return true;
  }

  // Try to use .env.example as template
  let template = '';
  if (existsSync(envExamplePath)) {
    template = readFileSync(envExamplePath, 'utf-8');
    log('Using .env.example as template', 'info');
  } else {
    // Create a basic template
    template = `# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/clinic-management
# Or use MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/clinic-management

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-session-secret-here-minimum-32-characters-long

# Optional: Email Configuration (SMTP)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_FROM=noreply@clinic.com

# Optional: SMS Configuration (Twilio)
# TWILIO_ACCOUNT_SID=your-account-sid
# TWILIO_AUTH_TOKEN=your-auth-token
# TWILIO_PHONE_NUMBER=+1234567890

# Optional: Cloudinary (Document Storage)
# CLOUDINARY_CLOUD_NAME=your-cloud-name
# CLOUDINARY_API_KEY=your-api-key
# CLOUDINARY_API_SECRET=your-api-secret

# Optional: Cron Jobs
# CRON_SECRET=your-cron-secret-here

# Optional: Encryption
# ENCRYPTION_KEY=your-encryption-key-here
`;
  }

  writeFileSync(envLocalPath, template);
  log('.env.local file created', 'success');
  log('Please edit .env.local and add your MongoDB connection string and SESSION_SECRET', 'warning');
  return true;
}

async function validateEnvironment(): Promise<boolean> {
  log('Validating environment variables...', 'info');
  const result = validateEnv();
  
  if (!result.valid) {
    log('Environment validation failed:', 'error');
    result.errors.forEach(error => log(`  - ${error}`, 'error'));
    return false;
  }

  // Check MONGODB_URI
  if (!process.env.MONGODB_URI) {
    log('MONGODB_URI is not set in .env.local', 'error');
    return false;
  }

  // Check SESSION_SECRET
  if (!process.env.SESSION_SECRET) {
    log('SESSION_SECRET is not set in .env.local', 'error');
    return false;
  }

  if (process.env.SESSION_SECRET.length < 32) {
    log('SESSION_SECRET must be at least 32 characters long', 'error');
    return false;
  }

  log('Environment variables validated', 'success');
  return true;
}

async function testMongoConnection(): Promise<boolean> {
  try {
    log('Testing MongoDB connection...', 'info');
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      log('MONGODB_URI is not set', 'error');
      return false;
    }

    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
    
    log('MongoDB connection successful', 'success');
    await mongoose.connection.close();
    return true;
  } catch (error: any) {
    log(`MongoDB connection failed: ${error.message}`, 'error');
    log('Please check your MONGODB_URI in .env.local', 'warning');
    return false;
  }
}

async function runSeedData(): Promise<boolean> {
  try {
    const answer = await question('\nDo you want to seed the database with sample data? (y/n): ');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      log('Skipping seed data', 'info');
      return true;
    }

    log('Running seed data script...', 'info');
    execSync('npm run seed', { stdio: 'inherit' });
    log('Seed data created successfully', 'success');
    return true;
  } catch (error: any) {
    log(`Failed to run seed data: ${error.message}`, 'error');
    return false;
  }
}

async function createAdminUser(): Promise<boolean> {
  try {
    const answer = await question('\nDo you want to create an admin user now? (y/n): ');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      log('Skipping admin user creation', 'info');
      log('You can create an admin user later by running: npm run setup:admin', 'info');
      return true;
    }

    log('Running admin user setup...', 'info');
    execSync('npm run setup:admin', { stdio: 'inherit' });
    return true;
  } catch (error: any) {
    log(`Failed to create admin user: ${error.message}`, 'error');
    return false;
  }
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Clinic Management System - Installation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Check Node.js version
  log('Step 1: Checking Node.js version...', 'info');
  if (!checkNodeVersion()) {
    log('Please install Node.js 20.9 or higher from https://nodejs.org/', 'error');
    rl.close();
    process.exit(1);
  }

  // Step 2: Check/Install dependencies
  log('\nStep 2: Checking dependencies...', 'info');
  if (!checkDependencies()) {
    const answer = await question('Dependencies not found. Install now? (y/n): ');
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      if (!installDependencies()) {
        rl.close();
        process.exit(1);
      }
    } else {
      log('Please run: npm install', 'warning');
      rl.close();
      process.exit(1);
    }
  }

  // Step 3: Create .env.local
  log('\nStep 3: Setting up environment variables...', 'info');
  createEnvFile();

  // Check if user wants to continue
  const continueSetup = await question('\nHave you updated .env.local with your MongoDB URI and SESSION_SECRET? (y/n): ');
  if (continueSetup.toLowerCase() !== 'y' && continueSetup.toLowerCase() !== 'yes') {
    log('Please update .env.local and run this script again', 'warning');
    rl.close();
    process.exit(0);
  }

  // Reload environment variables
  config({ path: resolve(process.cwd(), '.env.local') });
  config({ path: resolve(process.cwd(), '.env') });

  // Step 4: Validate environment
  log('\nStep 4: Validating environment variables...', 'info');
  if (!(await validateEnvironment())) {
    log('Please fix the environment variables in .env.local and run this script again', 'error');
    rl.close();
    process.exit(1);
  }

  // Step 5: Test MongoDB connection
  log('\nStep 5: Testing MongoDB connection...', 'info');
  if (!(await testMongoConnection())) {
    log('Please check your MongoDB connection and run this script again', 'error');
    rl.close();
    process.exit(1);
  }

  // Step 6: Run seed data (optional)
  log('\nStep 6: Database seeding (optional)...', 'info');
  await runSeedData();

  // Step 7: Create admin user (optional)
  log('\nStep 7: Admin user setup (optional)...', 'info');
  await createAdminUser();

  // Final summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Installation Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Next steps:');
  console.log('  1. Start the development server:');
  console.log('     npm run dev');
  console.log('\n  2. Open your browser and navigate to:');
  console.log('     http://localhost:3000');
  console.log('\n  3. If you haven\'t created an admin user yet, run:');
  console.log('     npm run setup:admin');
  console.log('\n  4. For production deployment, see README.md');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  rl.close();
  process.exit(0);
}

// Run the installation
main().catch((error) => {
  console.error('\n❌ Installation failed:', error);
  rl.close();
  process.exit(1);
});

