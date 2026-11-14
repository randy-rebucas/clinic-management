/**
 * Medical-rep self sign-up in the eMedRoute app (/api/medical-representatives/onboard/app/*) and its
 * activation fee. Off pauses it; clinics can still add reps from their own account.
 */
export function isMedRepSelfSignupEnabled(): boolean {
  return process.env.MEDREP_SELF_SIGNUP_ENABLED === 'true';
}
