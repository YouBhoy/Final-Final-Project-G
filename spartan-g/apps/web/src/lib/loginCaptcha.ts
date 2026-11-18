export const loginCaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '').trim();
const localDevelopment = import.meta.env.VITE_APP_ENV === 'development';
export const loginCaptchaEnabled = !localDevelopment
  && (import.meta.env.VITE_LOGIN_CAPTCHA_ENABLED === 'true' || Boolean(loginCaptchaSiteKey));

export async function verifyLoginCaptcha(token: string): Promise<void> {
  if (!loginCaptchaEnabled) return;
  const endpoint = (import.meta.env.VITE_CAPTCHA_VERIFY_URL ?? '').trim();
  if (!loginCaptchaSiteKey || !endpoint) {
    throw new Error('Login verification is not configured. Please contact support.');
  }
  if (!token) throw new Error('Please complete the reCAPTCHA before signing in.');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) {
      throw new Error('verification-failed');
    }
  } catch {
    throw new Error('Login verification failed. Please complete a new reCAPTCHA and try again.');
  }
}
