import { useEffect, useRef, useState } from 'react';
import { loginCaptchaSiteKey } from '../../lib/loginCaptcha';

interface RecaptchaApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => number;
  reset: (id: number) => void;
}
declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
    spartanCaptchaLoaded?: () => void;
  }
}

let apiPromise: Promise<RecaptchaApi> | undefined;
function loadApi(): Promise<RecaptchaApi> {
  if (!apiPromise) {
    apiPromise = new Promise<RecaptchaApi>((resolve, reject) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(() => fail(), 15000);
      function fail() {
        window.clearTimeout(timer);
        delete window.spartanCaptchaLoaded;
        script.remove();
        reject(new Error('reCAPTCHA could not load. Reload the page to try again.'));
      }
      window.spartanCaptchaLoaded = () => {
        window.clearTimeout(timer);
        delete window.spartanCaptchaLoaded;
        if (window.grecaptcha) resolve(window.grecaptcha);
        else fail();
      };
      script.src = 'https://www.google.com/recaptcha/api.js?onload=spartanCaptchaLoaded&render=explicit';
      script.async = true;
      script.defer = true;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export function LoginCaptcha({ onToken, resetCount }: { onToken: (token: string) => void; resetCount: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<number>();
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loginCaptchaSiteKey) {
      setError('Login verification is not configured. Please contact support.');
      return;
    }
    let active = true;
    let element: HTMLDivElement | undefined;
    loadApi().then(api => {
      if (!active || !container.current) return;
      element = document.createElement('div');
      container.current.appendChild(element);
      widget.current = api.render(element, {
        sitekey: loginCaptchaSiteKey,
        callback: (token: string) => { if (active) { setError(''); tokenCallback.current(token); } },
        'expired-callback': () => { if (active) { tokenCallback.current(''); setError('Verification expired. Please check the box again.'); } },
        'error-callback': () => { if (active) { tokenCallback.current(''); setError('reCAPTCHA is unavailable. Reload the page to try again.'); } },
      });
    }).catch(() => { if (active) setError('reCAPTCHA could not load. Reload the page to try again.'); });
    return () => {
      active = false;
      if (widget.current !== undefined) window.grecaptcha?.reset(widget.current);
      widget.current = undefined;
      element?.remove();
    };
  }, []);

  useEffect(() => {
    if (widget.current !== undefined) window.grecaptcha?.reset(widget.current);
    tokenCallback.current('');
  }, [resetCount]);

  return <div className="space-y-2">
    <div ref={container} aria-label="Login verification" />
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
  </div>;
}
