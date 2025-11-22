'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Box, Text, TextField, Separator, Heading, Spinner, Callout, Container, Section } from '@radix-ui/themes';
import { CheckIcon, Cross2Icon } from '@radix-ui/react-icons';

export default function SetupClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    clinicName: '',
  });

  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/api/setup');
      const data = await response.json();
      
      if (data.setupComplete) {
        setSetupComplete(true);
      } else {
        // Setup is not complete - show setup form
        setSetupComplete(false);
      }
    } catch (err: any) {
      // On error (including network errors, database connection issues), assume setup is needed
      console.error('Error checking setup status:', err);
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('Password must contain at least one letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return errors;
  };

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, adminPassword: password });
    const errors = validatePassword(password);
    setPasswordErrors(errors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate form
    if (!formData.adminName || !formData.adminEmail || !formData.adminPassword) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordErrors.length > 0) {
      setError('Please fix password errors');
      return;
    }

    // Validate email
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(formData.adminEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          clinicName: formData.clinicName || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Setup completed successfully! Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(data.error || 'Failed to complete setup');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container size="4">
        <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
          <Spinner size="3" />
        </Flex>
      </Container>
    );
  }

  if (setupComplete) {
    return (
      <Container size="4">
        <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
          <Card style={{ maxWidth: 500, width: '100%' }}>
            <Section p="6">
              <Flex direction="column" align="center" gap="4">
                <CheckIcon width="48" height="48" color="green" />
                <Heading size="6">Setup Already Complete</Heading>
                <Text color="gray" align="center">
                  The system has already been set up. Please log in to continue.
                </Text>
                <Button onClick={() => router.push('/login')}>
                  Go to Login
                </Button>
              </Flex>
            </Section>
          </Card>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="4">
      <Flex justify="center" align="center" style={{ minHeight: '100vh', padding: '2rem 0' }}>
        <Card style={{ maxWidth: 600, width: '100%' }}>
          <Section p="6">
            <Heading size="8" mb="2">System Setup</Heading>
            <Text color="gray" mb="6">
              Welcome! Let's set up your clinic management system. This will create default roles, permissions, and an admin account.
            </Text>

            {error && (
              <Callout.Root color="red" mb="4">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            {success && (
              <Callout.Root color="green" mb="4">
                <Callout.Text>{success}</Callout.Text>
              </Callout.Root>
            )}

            <form onSubmit={handleSubmit}>
              <Flex direction="column" gap="4">
                <Box>
                  <Text size="2" weight="medium" mb="1">
                    Clinic Name <Text color="gray">(optional)</Text>
                  </Text>
                  <TextField.Root
                    value={formData.clinicName}
                    onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                    placeholder="Enter clinic name"
                  />
                </Box>

                <Separator size="4" />

                <Heading size="5">Admin Account</Heading>
                <Text size="2" color="gray" mb="2">
                  Create the initial administrator account
                </Text>

                <Box>
                  <Text size="2" weight="medium" mb="1">
                    Admin Name <Text color="red">*</Text>
                  </Text>
                  <TextField.Root
                    value={formData.adminName}
                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                    placeholder="Enter admin name"
                    required
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="1">
                    Admin Email <Text color="red">*</Text>
                  </Text>
                  <TextField.Root
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    placeholder="Enter admin email"
                    required
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="1">
                    Admin Password <Text color="red">*</Text>
                  </Text>
                  <TextField.Root
                    type="password"
                    value={formData.adminPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder="Enter password"
                    required
                  />
                  {passwordErrors.length > 0 && (
                    <Box mt="2">
                      {passwordErrors.map((err, idx) => (
                        <Text key={idx} size="1" color="red" style={{ display: 'block' }}>
                          <Cross2Icon /> {err}
                        </Text>
                      ))}
                    </Box>
                  )}
                  {formData.adminPassword && passwordErrors.length === 0 && (
                    <Text size="1" color="green" mt="2">
                      <CheckIcon /> Password meets requirements
                    </Text>
                  )}
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="1">
                    Confirm Password <Text color="red">*</Text>
                  </Text>
                  <TextField.Root
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm password"
                    required
                  />
                  {formData.confirmPassword && formData.adminPassword !== formData.confirmPassword && (
                    <Text size="1" color="red" mt="2">
                      <Cross2Icon /> Passwords do not match
                    </Text>
                  )}
                  {formData.confirmPassword && formData.adminPassword === formData.confirmPassword && (
                    <Text size="1" color="green" mt="2">
                      <CheckIcon /> Passwords match
                    </Text>
                  )}
                </Box>

                <Separator size="4" />

                <Box>
                  <Text size="2" color="gray">
                    <strong>What will be created:</strong>
                  </Text>
                  <Box as="ul" mt="2" style={{ paddingLeft: '1.5rem' }}>
                    <Text as="li" size="2" color="gray">5 default roles (Admin, Doctor, Nurse, Receptionist, Accountant)</Text>
                    <Text as="li" size="2" color="gray">Permission documents for each role (stored in database)</Text>
                    <Text as="li" size="2" color="gray">Admin user account</Text>
                    <Text as="li" size="2" color="gray">Default system settings (appointments, billing, queue, etc.)</Text>
                    <Text as="li" size="2" color="gray">Business hours configuration</Text>
                  </Box>
                </Box>

                <Button 
                  type="submit" 
                  size="3" 
                  disabled={submitting || passwordErrors.length > 0}
                  style={{ width: '100%' }}
                >
                  {submitting ? (
                    <>
                      <Spinner size="2" /> Setting up system...
                    </>
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </Flex>
            </form>
          </Section>
        </Card>
      </Flex>
    </Container>
  );
}

