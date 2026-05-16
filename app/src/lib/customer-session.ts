const SESSION_STORAGE_KEY = 'dispatchiq_customer_portal_session_id';
const LAST_REFERENCE_STORAGE_KEY = 'dispatchiq_customer_portal_last_reference';
const DRAFT_STORAGE_KEY = 'dispatchiq_customer_portal_draft';

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cp-${crypto.randomUUID()}`;
  }
  return `cp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStorageValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(key);
  return value && value.trim() ? value : null;
}

function writeStorageValue(key: string, value: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!value || !value.trim()) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value.trim());
}

function readJsonValue<T>(key: string): T | null {
  const raw = readStorageValue(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
    return null;
  }
}

function writeJsonValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getOrCreateCustomerPortalSessionId(): string {
  const stored = readStorageValue(SESSION_STORAGE_KEY);
  if (stored) {
    return stored;
  }

  const created = createSessionId();
  writeStorageValue(SESSION_STORAGE_KEY, created);
  return created;
}

export function getCustomerLastReference(): string | null {
  return readStorageValue(LAST_REFERENCE_STORAGE_KEY);
}

export function setCustomerLastReference(referenceNumber: string | null): void {
  writeStorageValue(LAST_REFERENCE_STORAGE_KEY, referenceNumber);
}

export function loadCustomerPortalDraft<T = Record<string, unknown>>(): T | null {
  return readJsonValue<T>(DRAFT_STORAGE_KEY);
}

export function saveCustomerPortalDraft(draft: unknown): void {
  if (draft === null || draft === undefined) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    return;
  }

  writeJsonValue(DRAFT_STORAGE_KEY, draft);
}

export function clearCustomerPortalDraft(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}
