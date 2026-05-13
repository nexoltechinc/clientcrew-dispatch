type LoginRole = 'admin' | 'technician';

const LOGIN_EMAIL_STORAGE_KEYS: Record<LoginRole, string> = {
  admin: 'dispatchiq_admin_login_email',
  technician: 'dispatchiq_technician_login_email',
};

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function loadRememberedLoginEmail(role: LoginRole) {
  const storage = getStorage();
  if (!storage) {
    return '';
  }

  return storage.getItem(LOGIN_EMAIL_STORAGE_KEYS[role]) ?? '';
}

export function saveRememberedLoginEmail(role: LoginRole, email: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const value = email.trim();
  if (!value) {
    storage.removeItem(LOGIN_EMAIL_STORAGE_KEYS[role]);
    return;
  }

  storage.setItem(LOGIN_EMAIL_STORAGE_KEYS[role], value);
}

export function clearRememberedLoginEmail(role: LoginRole) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(LOGIN_EMAIL_STORAGE_KEYS[role]);
}

