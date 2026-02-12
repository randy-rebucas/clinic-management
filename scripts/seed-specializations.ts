import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { Specialization, Tenant } from '../models';
import {
  MEDICAL_SPECIALIZATIONS,
  categorizeSpecialization,
  getSpecializationDescription as getDescription,
} from '../lib/constants/specializations';

/**
 * Seed Medical Specializations
 * 
 * This script creates or updates medical specializations in the database.
 * It can be run independently or as part of the main seeding process.
 * 
 * Features:
 * - Creates all standard medical specializations
 * - Automatically categorizes specializations
 * - Support for multi-tenant architecture
 * - Idempotent: safe to run multiple times
 * 
 * Usage:
 *   npm run seed:specializations
 *   or
 *   ts-node scripts/seed-specializations.ts
 * 
 * Options:
 *   --tenant=<tenantId>  Specify tenant ID (optional, uses default if not provided)
 *   --reset              Delete existing specializations before seeding
 */

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

/**
 * Main seeding function
 */
async function seedSpecializations() {
  try {
    console.log('🏥 Medical Specializations Seed Script\n');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const tenantIdArg = args.find(arg => arg.startsWith('--tenant='))?.split('=')[1];
    const shouldReset = args.includes('--reset');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI or MONGO_URI not found in environment variables');
    }
    
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
    
    // Note: Specializations are now global and not tenant-scoped
    console.log('🌍 Specializations are globally available across all tenants\n');
    
    // Reset if requested
    if (shouldReset) {
      console.log('🗑️  Deleting existing specializations...');
      const deleteResult = await Specialization.deleteMany({});
      console.log(`   Deleted ${deleteResult.deletedCount} specializations\n`);
    }
    
    // Seed specializations
    console.log('🌱 Seeding medical specializations...\n');
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const specName of MEDICAL_SPECIALIZATIONS) {
      try {
        // Check if specialization already exists (global lookup)
        const existing = await Specialization.findOne({
          name: specName,
        });
        
        const specData = {
          name: specName,
          category: categorizeSpecialization(specName),
          description: getDescription(specName),
          active: true,
        };
        
        if (existing) {
          // Update existing specialization
          await Specialization.findByIdAndUpdate(existing._id, specData);
          console.log(`   ✓ Updated: ${specName}`);
          updated++;
        } else {
          // Create new specialization
          await Specialization.create(specData);
          console.log(`   + Created: ${specName}`);
          created++;
        }
      } catch (error: any) {
        if (error.code === 11000) {
          // Duplicate key error - already exists
          console.log(`   ~ Skipped: ${specName} (already exists)`);
          skipped++;
        } else {
          console.error(`   ✗ Error with ${specName}:`, error.message);
        }
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Created:  ${created}`);
    console.log(`   Updated:  ${updated}`);
    console.log(`   Skipped:  ${skipped}`);
    console.log(`   Total:    ${MEDICAL_SPECIALIZATIONS.length}`);
    console.log('='.repeat(60));
    
    // Category breakdown
    console.log('\n📋 Specializations by Category:');
    const categories: Record<string, string[]> = {};
    
    for (const spec of MEDICAL_SPECIALIZATIONS) {
      const category = categorizeSpecialization(spec);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(spec);
    }
    
    for (const [category, specs] of Object.entries(categories)) {
      console.log(`\n   ${category} (${specs.length}):`);
      specs.forEach(spec => console.log(`     • ${spec}`));
    }
    
    console.log('\n✅ Specializations seeding completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error seeding specializations:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  seedSpecializations();
}

export { seedSpecializations };
