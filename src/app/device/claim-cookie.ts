// Shared between actions.ts, a "use server" file that can only export async functions, and
// page.tsx, which reads this cookie directly to decide which screen to render.
export const CLAIM_COOKIE = "device_claim";
export const CLAIM_COOKIE_MAX_AGE_SECONDS = 5 * 60;
