import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { resolve } from 'path';
import connectDB from '@/lib/mongodb';
import { isSetupComplete } from '@/lib/setup';
import { validateEnv } from '@/lib/env-validation';

/**
 * Check installation prerequisites and status
 */
export async function GET() {
  try {
    const envLocalPath = resolve(process.cwd(), '.env.local');
    const envLocalExists = existsSync(envLocalPath);

    const checks = {
      nodeVersion: process.version,
      nodeVersionValid: false,
      dependenciesInstalled: false,
      envLocalExists: envLocalExists,
      environmentConfigured: false,
      databaseConnected: false,
      databaseReset: false,
      setupComplete: false,
      errors: [] as string[],
      warnings: [] as string[],
    };

    // Check Node.js version
    const nodeMajor = parseInt(process.version.slice(1).split('.')[0]);
    if (nodeMajor >= 20) {
      checks.nodeVersionValid = true;
    } else {
      checks.errors.push(`Node.js version ${process.version} detected. Node.js 20.9 or higher is required.`);
    }

    // Check if dependencies are installed
    const nodeModulesPath = resolve(process.cwd(), 'node_modules');
    if (existsSync(nodeModulesPath)) {
      checks.dependenciesInstalled = true;
    } else {
      checks.warnings.push('Dependencies not installed. Run "npm install" to install them.');
    }

    // Check environment variables
    const envValidation = validateEnv();
    if (process.env.MONGODB_URI && process.env.SESSION_SECRET) {
      const mongodbValid = process.env.MONGODB_URI.startsWith('mongodb://') || 
                          process.env.MONGODB_URI.startsWith('mongodb+srv://');
      const sessionSecretValid = process.env.SESSION_SECRET.length >= 32;
      
      if (mongodbValid && sessionSecretValid && envValidation.valid) {
        checks.environmentConfigured = true;
      } else {
        if (!mongodbValid) {
          checks.errors.push('MONGODB_URI must be a valid MongoDB connection string');
        }
        if (!sessionSecretValid) {
          checks.errors.push('SESSION_SECRET must be at least 32 characters long');
        }
        if (!envValidation.valid && envValidation.errors.length > 0) {
          checks.errors.push(...envValidation.errors);
        }
        // If file exists but variables are invalid, provide specific guidance
        if (envLocalExists) {
          checks.warnings.push('.env.local file exists but contains invalid or incomplete configuration. Please update the file with valid values.');
        }
      }
    } else {
      // File exists but variables are missing
      if (envLocalExists) {
        checks.warnings.push('.env.local file exists but MONGODB_URI or SESSION_SECRET is missing. Please add the required variables to the file.');
      } else {
        checks.warnings.push('Environment variables not configured. Create .env.local file with MONGODB_URI and SESSION_SECRET.');
      }
    }

    // Test database connection if environment is configured
    if (checks.environmentConfigured) {
      try {
        await connectDB();
        checks.databaseConnected = true;
      } catch (error: any) {
        checks.errors.push(`Database connection failed: ${error.message}`);
        checks.databaseConnected = false;
      }
    }

    // Check if database is reset (no roles exist = reset)
    if (checks.databaseConnected) {
      try {
        const Role = (await import('@/models/Role')).default;
        const roleCount = await Role.countDocuments({});
        checks.databaseReset = roleCount === 0;
        
        // Check if setup is complete
        checks.setupComplete = await isSetupComplete();
      } catch (error) {
        // If we can't check, assume not reset and not complete
        checks.databaseReset = false;
        checks.setupComplete = false;
      }
    }

    return NextResponse.json({
      success: true,
      checks,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to check installation status',
      },
      { status: 500 }
    );
  }
}

