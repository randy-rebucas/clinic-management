/**
 * Public medical-rep self-registration (and its activation fee) stays off until reps have an
 * app to sign in to. Clinics can still add reps from their own account.
 */
export function isMedRepSelfSignupEnabled(): boolean {
  return process.env.MEDREP_SELF_SIGNUP_ENABLED === 'true';
}
