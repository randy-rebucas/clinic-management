/**
 * Test Script: Receptionist User Auto-Creation
 * 
 * This script tests that when a Receptionist is created,
 * a User account is automatically created via the post-save hook.
 * 
 * Run with: node test-receptionist-user-creation.js
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function testReceptionistUserCreation() {
  try {
    console.log('🧪 Starting Receptionist User Auto-Creation Test\n');
    console.log('='.repeat(60));
    
    // Connect to MongoDB
    console.log('\n📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Import models (this will trigger model registration)
    console.log('📚 Loading models...');
    const Receptionist = require('./models/Receptionist').default;
    const User = require('./models/User').default;
    const Role = require('./models/Role').default;
    const Tenant = require('./models/Tenant').default;
    console.log('✅ Models loaded\n');

    // Check if receptionist role exists
    console.log('🔍 Checking for receptionist role...');
    const receptionistRole = await Role.findOne({ name: 'receptionist' });
    if (!receptionistRole) {
      console.error('❌ Receptionist role not found in database!');
      console.log('💡 Please run tenant onboarding or create roles first');
      process.exit(1);
    }
    console.log('✅ Receptionist role exists:', {
      id: receptionistRole._id,
      name: receptionistRole.name,
      tenantId: receptionistRole.tenantId?.toString() || 'global'
    });
    console.log('');

    // Get a tenant (if multi-tenant)
    let tenantId = null;
    const tenant = await Tenant.findOne({ status: 'active' });
    if (tenant) {
      tenantId = tenant._id;
      console.log('🏢 Using tenant:', {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain
      });
      console.log('');
    } else {
      console.log('ℹ️  No tenant found, creating without tenant\n');
    }

    // Generate test data
    const timestamp = Date.now();
    const testEmail = `test-receptionist-${timestamp}@example.com`;
    
    const testReceptionistData = {
      firstName: 'Test',
      lastName: 'Receptionist',
      email: testEmail,
      phone: '1234567890',
      employeeId: `EMP${timestamp}`,
      status: 'active'
    };

    if (tenantId) {
      testReceptionistData.tenantId = tenantId;
    }

    console.log('📝 Creating test receptionist with data:', {
      name: `${testReceptionistData.firstName} ${testReceptionistData.lastName}`,
      email: testReceptionistData.email,
      phone: testReceptionistData.phone,
      employeeId: testReceptionistData.employeeId,
      tenantId: tenantId?.toString() || 'none'
    });
    console.log('');
    console.log('='.repeat(60));

    // Create receptionist (this should trigger the post-save hook)
    const receptionist = await Receptionist.create(testReceptionistData);
    
    console.log('='.repeat(60));
    console.log('');

    // Wait a moment for the hook to complete
    console.log('⏳ Waiting for post-save hook to complete...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('');

    // Check if User was created
    console.log('🔍 Checking if User was created...');
    const user = await User.findOne({ 
      email: testEmail.toLowerCase() 
    }).populate('role');

    if (!user) {
      console.error('❌ TEST FAILED: User was not created!');
      console.log('');
      console.log('🔍 Troubleshooting:');
      console.log('   1. Check console logs above for errors in the post-save hook');
      console.log('   2. Verify receptionist role exists in database');
      console.log('   3. Check if models are properly imported');
      console.log('');
      
      // Cleanup
      await Receptionist.deleteOne({ _id: receptionist._id });
      process.exit(1);
    }

    // Verify user details
    console.log('✅ User was created successfully!\n');
    console.log('👤 User Details:', {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role?.name || 'unknown',
      receptionistProfile: user.receptionistProfile?.toString() || 'none',
      tenantId: user.tenantId?.toString() || 'none',
      status: user.status
    });
    console.log('');

    // Verify profile link
    if (user.receptionistProfile?.toString() === receptionist._id.toString()) {
      console.log('✅ User correctly linked to receptionist profile');
    } else {
      console.error('❌ User NOT linked to receptionist profile!');
    }

    // Verify tenant matching
    if (tenantId) {
      if (user.tenantId?.toString() === tenantId.toString()) {
        console.log('✅ User has correct tenantId');
      } else {
        console.error('❌ User has incorrect tenantId!');
        console.log('   Expected:', tenantId.toString());
        console.log('   Got:', user.tenantId?.toString() || 'none');
      }
    }

    // Verify role
    if (user.role?.name === 'receptionist') {
      console.log('✅ User has correct role (receptionist)');
    } else {
      console.error('❌ User has incorrect role!');
      console.log('   Expected: receptionist');
      console.log('   Got:', user.role?.name || 'none');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('🎉 TEST PASSED! All checks successful!');
    console.log('='.repeat(60));
    console.log('');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await User.deleteOne({ _id: user._id });
    await Receptionist.deleteOne({ _id: receptionist._id });
    console.log('✅ Test data cleaned up');
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the test
testReceptionistUserCreation();
