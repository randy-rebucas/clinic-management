/**
 * Script to create User accounts for existing MedicalRepresentatives that don't have one
 * Run with: npx tsx scripts/fix-medical-rep-users.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import connectDB from '../lib/mongodb';
import MedicalRepresentative from '../models/MedicalRepresentative';
import User from '../models/User';
import Role from '../models/Role';

async function fixMedicalRepUsers() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    // Find all medical representatives without a userId
    const medicalRepsWithoutUser = await MedicalRepresentative.find({ 
      userId: { $exists: false } 
    });

    console.log(`Found ${medicalRepsWithoutUser.length} medical representatives without User accounts`);

    if (medicalRepsWithoutUser.length === 0) {
      console.log('All medical representatives have User accounts. Nothing to fix.');
      process.exit(0);
    }

    // Find or create the medical-representative role
    let role = await Role.findOne({ name: 'medical-representative' });
    if (!role) {
      console.log('Creating medical-representative role...');
      role = await Role.create({
        name: 'medical-representative',
        description: 'Medical Representative with access to their portal',
        permissions: ['view_own_profile', 'update_own_profile'],
        tenantId: undefined,
      });
      console.log('Medical representative role created');
    }

    // Process each medical representative
    for (const medicalRep of medicalRepsWithoutUser) {
      try {
        console.log(`\nProcessing: ${medicalRep.email}`);

        // Check if User already exists
        let user = await User.findOne({ email: medicalRep.email });
        
        if (user) {
          console.log(`  - User already exists for ${medicalRep.email}`);
          // Just link them
          await MedicalRepresentative.updateOne(
            { _id: medicalRep._id },
            { $set: { userId: user._id } }
          );
          console.log(`  - Linked existing User to MedicalRepresentative`);
        } else {
          console.log(`  - Creating new User for ${medicalRep.email}`);
          
          // Create a new User account
          user = await User.create({
            name: `${medicalRep.firstName} ${medicalRep.lastName}`.trim(),
            email: medicalRep.email,
            password: medicalRep.password, // Already hashed
            role: role._id,
            isActive: true,
            medicalRepresentativeProfile: medicalRep._id,
            tenantId: undefined,
          });

          console.log(`  - User created with ID: ${user._id}`);

          // Link the User to the MedicalRepresentative
          await MedicalRepresentative.updateOne(
            { _id: medicalRep._id },
            { $set: { userId: user._id } }
          );

          console.log(`  - Linked new User to MedicalRepresentative`);
        }
      } catch (error: any) {
        console.error(`  - Error processing ${medicalRep.email}:`, error.message);
      }
    }

    console.log('\n✓ Fixed all medical representative User accounts');
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixMedicalRepUsers();
