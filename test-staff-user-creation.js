/**
 * Test Script: Staff User Auto-Creation
 * 
 * This script tests that when staff members (Nurse, Receptionist, Accountant) are created,
 * User accounts are automatically created via the post-save hooks.
 * 
 * Run with: node test-staff-user-creation.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function testStaffUserCreation(staffType) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing ${staffType.toUpperCase()} User Auto-Creation`);
  console.log('='.repeat(70));
  
  try {
    // Get the appropriate model
    let StaffModel;
    let profileField;
    
    switch(staffType) {
      case 'nurse':
        StaffModel = require('./models/Nurse').default;
        profileField = 'nurseProfile';
        break;
      case 'receptionist':
        StaffModel = require('./models/Receptionist').default;
        profileField = 'receptionistProfile';
        break;
      case 'accountant':
        StaffModel = require('./models/Accountant').default;
        profileField = 'accountantProfile';
        break;
      default:
        throw new Error(`Unknown staff type: ${staffType}`);
    }
    
    const User = require('./models/User').default;
    const Role = require('./models/Role').default;
    const Tenant = require('./models/Tenant').default;

    // Check if role exists
    console.log(`\n🔍 Checking for ${staffType} role...`);
    const role = await Role.findOne({ name: staffType });
    if (!role) {
      console.error(`❌ ${staffType} role not found in database!`);
      console.log('💡 Please run tenant onboarding or create roles first');
      return false;
    }
    console.log(`✅ ${staffType} role exists:`, {
      id: role._id,
      name: role.name,
      tenantId: role.tenantId?.toString() || 'global'
    });

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
    } else {
      console.log('ℹ️  No tenant found, creating without tenant');
    }

    // Generate test data
    const timestamp = Date.now();
    const testEmail = `test-${staffType}-${timestamp}@example.com`;
    
    const testStaffData = {
      firstName: 'Test',
      lastName: staffType.charAt(0).toUpperCase() + staffType.slice(1),
      email: testEmail,
      phone: '1234567890',
      employeeId: `EMP${timestamp}`,
      status: 'active'
    };

    if (tenantId) {
      testStaffData.tenantId = tenantId;
    }

    console.log(`\n📝 Creating test ${staffType} with data:`, {
      name: `${testStaffData.firstName} ${testStaffData.lastName}`,
      email: testStaffData.email,
      phone: testStaffData.phone,
      employeeId: testStaffData.employeeId,
      tenantId: tenantId?.toString() || 'none'
    });
    console.log('');
    console.log('-'.repeat(70));

    // Create staff (this should trigger the post-save hook)
    const staff = await StaffModel.create(testStaffData);
    
    console.log('-'.repeat(70));

    // Wait a moment for the hook to complete
    console.log('\n⏳ Waiting for post-save hook to complete...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if User was created
    console.log(`\n🔍 Checking if User was created...`);
    const user = await User.findOne({ 
      email: testEmail.toLowerCase() 
    }).populate('role');

    if (!user) {
      console.error(`❌ TEST FAILED: User was not created for ${staffType}!`);
      console.log('🔍 Check console logs above for errors in the post-save hook');
      
      // Cleanup
      await StaffModel.deleteOne({ _id: staff._id });
      return false;
    }

    // Verify user details
    console.log('✅ User was created successfully!\n');
    console.log('👤 User Details:', {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role?.name || 'unknown',
      profile: user[profileField]?.toString() || 'none',
      tenantId: user.tenantId?.toString() || 'none',
      status: user.status
    });

    let allChecksPassed = true;

    // Verify profile link
    if (user[profileField]?.toString() === staff._id.toString()) {
      console.log(`✅ User correctly linked to ${staffType} profile`);
    } else {
      console.error(`❌ User NOT linked to ${staffType} profile!`);
      allChecksPassed = false;
    }

    // Verify tenant matching
    if (tenantId) {
      if (user.tenantId?.toString() === tenantId.toString()) {
        console.log('✅ User has correct tenantId');
      } else {
        console.error('❌ User has incorrect tenantId!');
        console.log('   Expected:', tenantId.toString());
        console.log('   Got:', user.tenantId?.toString() || 'none');
        allChecksPassed = false;
      }
    }

    // Verify role
    if (user.role?.name === staffType) {
      console.log(`✅ User has correct role (${staffType})`);
    } else {
      console.error('❌ User has incorrect role!');
      console.log(`   Expected: ${staffType}`);
      console.log('   Got:', user.role?.name || 'none');
      allChecksPassed = false;
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await User.deleteOne({ _id: user._id });
    await StaffModel.deleteOne({ _id: staff._id });
    console.log('✅ Test data cleaned up');

    if (allChecksPassed) {
      console.log('\n🎉 TEST PASSED for', staffType.toUpperCase());
    } else {
      console.log('\n⚠️  TEST COMPLETED WITH WARNINGS for', staffType.toUpperCase());
    }
    
    return allChecksPassed;

  } catch (error) {
    console.error(`\n❌ TEST ERROR for ${staffType}:`, error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function runAllTests() {
  try {
    console.log('\n🧪 STAFF USER AUTO-CREATION TEST SUITE');
    console.log('='.repeat(70));
    console.log('Testing automatic User creation for all staff types');
    console.log('='.repeat(70));
    
    // Connect to MongoDB
    console.log('\n📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n📚 Loading models...');
    // Pre-load models
    require('./models/Nurse');
    require('./models/Receptionist');
    require('./models/Accountant');
    require('./models/User');
    require('./models/Role');
    require('./models/Tenant');
    console.log('✅ Models loaded');

    // Test each staff type
    const results = {
      nurse: await testStaffUserCreation('nurse'),
      receptionist: await testStaffUserCreation('receptionist'),
      accountant: await testStaffUserCreation('accountant')
    };

    // Summary
    console.log('\n\n');
    console.log('='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Nurse:        ${results.nurse ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Receptionist: ${results.receptionist ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Accountant:   ${results.accountant ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');

    const allPassed = results.nurse && results.receptionist && results.accountant;
    
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ User auto-creation is working correctly for all staff types');
    } else {
      console.log('⚠️  SOME TESTS FAILED');
      console.log('🔍 Review the logs above for details');
    }
    
    console.log('='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST SUITE ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB\n');
    process.exit(0);
  }
}

// Run all tests
runAllTests();
