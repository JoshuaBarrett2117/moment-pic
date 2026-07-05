const AUTH_SESSION_KEY = 'auth_token';
const AUTH_SESSION_VALUE = 'authenticated';

export const hasAuthSession = (): boolean =>
  typeof window !== 'undefined' && window.localStorage.getItem(AUTH_SESSION_KEY) === AUTH_SESSION_VALUE;

export const markAuthSession = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_KEY, AUTH_SESSION_VALUE);
};

export const clearAuthSession = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_KEY);
};

export const notifyAuthExpired = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('moment-pic-auth-expired'));
};
