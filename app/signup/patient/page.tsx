"use client";
import { useRouter } from 'next/navigation';

import { useState } from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';

import { TypographyH2 } from '../../../components/ui/typography';
import { Select, SelectItem } from '../../../components/ui/select';

// Step components
function StepPersonal({ data, onChange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <TypographyH2 className="mb-2">Personal Information</TypographyH2>
        <Label className="font-semibold text-base sm:text-lg" htmlFor="firstName">First Name</Label>
        <Input id="firstName" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="First Name" value={data.firstName} onChange={e => onChange({ ...data, firstName: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="middleName">Middle Name</Label>
      <Input id="middleName" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Middle Name" value={data.middleName} onChange={e => onChange({ ...data, middleName: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="lastName">Last Name</Label>
      <Input id="lastName" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Last Name" value={data.lastName} onChange={e => onChange({ ...data, lastName: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="suffix">Suffix</Label>
      <Input id="suffix" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Suffix" value={data.suffix} onChange={e => onChange({ ...data, suffix: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="dateOfBirth">Date of Birth</Label>
      <Input id="dateOfBirth" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" type="date" placeholder="Date of Birth" value={data.dateOfBirth} onChange={e => onChange({ ...data, dateOfBirth: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="sex">Sex</Label>
      <Select value={data.sex} onValueChange={value => onChange({ ...data, sex: value })}>
        <SelectItem value="unknown">Sex</SelectItem>
        <SelectItem value="male">Male</SelectItem>
        <SelectItem value="female">Female</SelectItem>
        <SelectItem value="other">Other</SelectItem>
      </Select>
      <Label className="font-semibold text-base sm:text-lg" htmlFor="civilStatus">Civil Status</Label>
      <Input id="civilStatus" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Civil Status" value={data.civilStatus} onChange={e => onChange({ ...data, civilStatus: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="nationality">Nationality</Label>
      <Input id="nationality" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Nationality" value={data.nationality} onChange={e => onChange({ ...data, nationality: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="occupation">Occupation</Label>
      <Input id="occupation" className="block w-full mt-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-blue-500 rounded-lg text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Occupation" value={data.occupation} onChange={e => onChange({ ...data, occupation: e.target.value })} />
    </div>
  );
}

function StepContact({ data, onChange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <TypographyH2 className="mb-2">Contact Information</TypographyH2>
      <Label className="font-semibold text-base sm:text-lg" htmlFor="email">Email</Label>
      <Input id="email" className="block w-full mt-1" placeholder="Email" value={data.email} onChange={e => onChange({ ...data, email: e.target.value })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="phone">Phone</Label>
      <Input id="phone" className="block w-full mt-1" placeholder="Phone" value={data.phone} onChange={e => onChange({ ...data, phone: e.target.value })} />
    </div>
  );
}

function StepAddress({ data, onChange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <TypographyH2 className="mb-2">Address</TypographyH2>
      <Label className="font-semibold text-base sm:text-lg" htmlFor="street">Street</Label>
      <Input id="street" className="block w-full mt-1" placeholder="Street" value={data.address.street} onChange={e => onChange({ ...data, address: { ...data.address, street: e.target.value } })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="city">City</Label>
      <Input id="city" className="block w-full mt-1" placeholder="City" value={data.address.city} onChange={e => onChange({ ...data, address: { ...data.address, city: e.target.value } })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="state">State</Label>
      <Input id="state" className="block w-full mt-1" placeholder="State" value={data.address.state} onChange={e => onChange({ ...data, address: { ...data.address, state: e.target.value } })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="zipCode">Zip Code</Label>
      <Input id="zipCode" className="block w-full mt-1" placeholder="Zip Code" value={data.address.zipCode} onChange={e => onChange({ ...data, address: { ...data.address, zipCode: e.target.value } })} />
    </div>
  );
}

function StepEmergency({ data, onChange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <TypographyH2 className="mb-2">Emergency Contact</TypographyH2>
      <Label className="font-semibold text-base sm:text-lg" htmlFor="emergencyName">Name</Label>
      <Input id="emergencyName" className="block w-full mt-1" placeholder="Name" value={data.emergencyContact.name} onChange={e => onChange({ ...data, emergencyContact: { ...data.emergencyContact, name: e.target.value } })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="emergencyPhone">Phone</Label>
      <Input id="emergencyPhone" className="block w-full mt-1" placeholder="Phone" value={data.emergencyContact.phone} onChange={e => onChange({ ...data, emergencyContact: { ...data.emergencyContact, phone: e.target.value } })} />
      <Label className="font-semibold text-base sm:text-lg" htmlFor="emergencyRelationship">Relationship</Label>
      <Input id="emergencyRelationship" className="block w-full mt-1" placeholder="Relationship" value={data.emergencyContact.relationship} onChange={e => onChange({ ...data, emergencyContact: { ...data.emergencyContact, relationship: e.target.value } })} />
    </div>
  );
}

function StepMedical({ data, onChange }: any) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-bold mb-2">Medical History</h2>
      <Label className="font-semibold text-base sm:text-lg" htmlFor="medicalHistory">Medical History</Label>
      <Input id="medicalHistory" className="block w-full mt-1" placeholder="Medical History" value={data.medicalHistory} onChange={e => onChange({ ...data, medicalHistory: e.target.value })} />
    </div>
  );
}

export default function PatientSignupPage() {
  const [step, setStep] = useState(0);
    const router = useRouter();
  const [formData, setFormData] = useState<any>({
    firstName: '', middleName: '', lastName: '', suffix: '', dateOfBirth: '', sex: 'unknown', civilStatus: '', nationality: '', occupation: '', email: '', phone: '', address: { street: '', city: '', state: '', zipCode: '' }, emergencyContact: { name: '', phone: '', relationship: '' }, medicalHistory: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const steps = [
    { label: 'Personal', component: StepPersonal },
    { label: 'Contact', component: StepContact },
    { label: 'Address', component: StepAddress },
    { label: 'Emergency', component: StepEmergency },
    { label: 'Medical', component: StepMedical },
  ];

  const handleNext = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...formData };
      payload.dateOfBirth = new Date(payload.dateOfBirth);
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setError('You must be logged in to register.');
        return;
      }
              <TypographyH2 className="mb-2">Medical History</TypographyH2>
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        setError(`Failed to register: API error (Status: ${res.status})`);
        return;
      }
      if (data.success) {
        setSuccess('Registration successful! Your patient record has been created.');
        router.push(`/patients/${data.data._id}`);
      } else {
        setError('Error: ' + (data.error || 'Unknown error occurred'));
      }
    } catch (error: any) {
      setError(`Failed to register: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const StepComponent = steps[step].component;

  return (
    <section className="py-8 px-2 sm:px-4">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col gap-4">
          <div className="mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Patient Self-Onboarding</h1>
            <p className="text-xs sm:text-sm text-gray-600">Step {step + 1} of {steps.length}: {steps[step].label}</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-red-700 text-xs sm:text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 text-green-700 text-xs sm:text-sm">{success}</div>
          )}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-3 min-h-[180px] sm:min-h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-xs sm:text-sm text-gray-600">Registering...</p>
              </div>
            ) : (
              <>
                <StepComponent data={formData} onChange={setFormData} />
                <div className="flex flex-col sm:flex-row gap-2 mt-6">
                  {step > 0 && <Button type="button" variant="outline" onClick={handleBack}>Back</Button>}
                  {step < steps.length - 1 && <Button type="button" onClick={handleNext}>Next</Button>}
                  {step === steps.length - 1 && <Button type="button" variant="default" onClick={handleSubmit}>Submit</Button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
