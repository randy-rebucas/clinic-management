import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import bcrypt from 'bcryptjs';
import readline from 'readline';

// Load environment variables from .env.local (Next.js convention)
// Try .env.local first, then fall back to .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('🔧 Setting up admin user...\n');

    // Check environment variables
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      console.error('❌ Error: MONGODB_URI environment variable is not set.');
      console.error('   Please set it in your .env.local file.');
      rl.close();
      process.exit(1);
    }

    // Connect to database
    console.log('📡 Connecting to database...');
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
    console.log('✅ Connected to database\n');

    // Find or create admin role
    let adminRole = await Role.findOne({ name: 'admin' });
    if (!adminRole) {
      console.log('📋 Creating admin role...');
      adminRole = await Role.create({
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full system access with all permissions',
        level: 100,
        isActive: true,
        defaultPermissions: [
          { resource: '*', actions: ['*'] },
        ],
      });
      console.log('✅ Admin role created\n');
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: adminRole._id });
    if (existingAdmin) {
      console.log('⚠️  An admin user already exists.');
      console.log(`   Email: ${existingAdmin.email}`);
      const overwrite = await question('Do you want to create another admin? (y/n): ');
      if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
        console.log('❌ Aborted.');
        rl.close();
        await mongoose.connection.close();
        process.exit(0);
      }
    }

    // Get user input
    const name = await question('Enter admin name: ');
    if (!name || name.trim().length < 2) {
      console.log('❌ Name must be at least 2 characters long.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }

    const email = await question('Enter admin email: ');
    if (!email || !email.includes('@')) {
      console.log('❌ Please enter a valid email address.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ A user with this email already exists.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }

    const password = await question('Enter admin password (min 8 chars, must include letter, number, and special char): ');
    
    // Validate password
    if (password.length < 8) {
      console.log('❌ Password must be at least 8 characters long.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }
    if (!/[a-zA-Z]/.test(password)) {
      console.log('❌ Password must contain at least one letter.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }
    if (!/[0-9]/.test(password)) {
      console.log('❌ Password must contain at least one number.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      console.log('❌ Password must contain at least one special character.');
      rl.close();
      await mongoose.connection.close();
      process.exit(1);
    }

    // Hash password
    console.log('\n🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    console.log('👤 Creating admin user...');
    const admin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: adminRole._id,
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${adminRole.name} (${adminRole.displayName})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🎉 You can now log in with these credentials.');
    console.log('   Navigate to http://localhost:3000/login\n');

    rl.close();
    await mongoose.connection.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error creating admin user:', error.message);
    if (error.code === 11000) {
      console.error('   A user with this email already exists.');
    }
    rl.close();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run the script
createAdmin();
