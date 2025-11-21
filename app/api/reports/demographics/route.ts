import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can view demographics reports
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const patients = await Patient.find({}).lean();

    // Age groups
    const ageGroups: Record<string, number> = {
      '0-12': 0,
      '13-17': 0,
      '18-25': 0,
      '26-35': 0,
      '36-45': 0,
      '46-55': 0,
      '56-65': 0,
      '66+': 0,
    };

    const now = new Date();
    patients.forEach((patient: any) => {
      if (patient.dateOfBirth) {
        const birthDate = new Date(patient.dateOfBirth);
        const age = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate()) ? age - 1 : age;

        if (actualAge <= 12) ageGroups['0-12']++;
        else if (actualAge <= 17) ageGroups['13-17']++;
        else if (actualAge <= 25) ageGroups['18-25']++;
        else if (actualAge <= 35) ageGroups['26-35']++;
        else if (actualAge <= 45) ageGroups['36-45']++;
        else if (actualAge <= 55) ageGroups['46-55']++;
        else if (actualAge <= 65) ageGroups['56-65']++;
        else ageGroups['66+']++;
      }
    });

    // Gender distribution
    const byGender = patients.reduce((acc: any, patient: any) => {
      const gender = patient.sex || 'unknown';
      acc[gender] = (acc[gender] || 0) + 1;
      return acc;
    }, {});

    // Civil status
    const byCivilStatus = patients.reduce((acc: any, patient: any) => {
      const status = patient.civilStatus || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Location (by city)
    const byCity = patients.reduce((acc: any, patient: any) => {
      const city = patient.address?.city || 'Unknown';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    // Nationality
    const byNationality = patients.reduce((acc: any, patient: any) => {
      const nationality = patient.nationality || 'Unknown';
      acc[nationality] = (acc[nationality] || 0) + 1;
      return acc;
    }, {});

    // Patients with pre-existing conditions
    const withConditions = patients.filter((p: any) => 
      p.preExistingConditions && p.preExistingConditions.length > 0
    ).length;

    // Patients with allergies
    const withAllergies = patients.filter((p: any) => 
      p.allergies && (Array.isArray(p.allergies) ? p.allergies.length > 0 : true)
    ).length;

    // Patients with insurance
    const withInsurance = patients.filter((p: any) => 
      p.identifiers?.philHealth || p.identifiers?.other
    ).length;

    // Discount eligibility
    const discountEligibility = {
      pwd: patients.filter((p: any) => p.discountEligibility?.pwd?.eligible).length,
      senior: patients.filter((p: any) => {
        if (p.discountEligibility?.senior?.eligible) return true;
        if (p.dateOfBirth) {
          const birthDate = new Date(p.dateOfBirth);
          const age = now.getFullYear() - birthDate.getFullYear();
          const monthDiff = now.getMonth() - birthDate.getMonth();
          const actualAge = monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate()) ? age - 1 : age;
          return actualAge >= 60;
        }
        return false;
      }).length,
      membership: patients.filter((p: any) => p.discountEligibility?.membership?.eligible).length,
    };

    // Top cities
    const topCities = Object.entries(byCity)
      .map(([city, count]) => ({ city, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalPatients: patients.length,
          withConditions,
          withAllergies,
          withInsurance,
        },
        demographics: {
          ageGroups,
          byGender,
          byCivilStatus,
          byNationality,
          byCity,
        },
        discountEligibility,
        topCities,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating demographics report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate demographics report' },
      { status: 500 }
    );
  }
}

