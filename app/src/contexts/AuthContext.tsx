import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, UserRole } from '@/types';
import { currentUser, technicianUser } from '@/mock/data';
import {
  approveAdminTechnicianSignupRequest,
  clearStoredTechnicianToken,
  clearStoredAdminToken,
  createTechnicianSignupRequest,
  fetchDevTechnicianToken,
  fetchTechnicianMeProfile,
  fetchAdminTechnicianSignupRequests,
  fetchAdminTechnicians,
  fetchDevAdminToken,
  getStoredAdminToken,
  getStoredTechnicianToken,
  rejectAdminTechnicianSignupRequest,
  setStoredAdminToken,
  setStoredTechnicianToken,
  updateAdminTechnician,
} from '@/lib/backend-api';

type TechnicianAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TechnicianSignupRequest = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  requestedAt: string;
  updatedAt: string;
};

export type TechnicianAccountSummary = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianSignupRequestSummary = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  requestedAt: string;
  updatedAt: string;
};

export type TechnicianSignupInput = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

export type TechnicianAccountUpdateInput = {
  name: string;
  email: string;
  phone?: string;
  password?: string;
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isTechnician: boolean;
  hasBackendAdminToken: boolean;
  hasBackendTechnicianToken: boolean;
  technicianAccounts: TechnicianAccountSummary[];
  pendingTechnicianRequests: TechnicianSignupRequestSummary[];
  syncAdminData: () => Promise<void>;
  login: (email: string, password: string, role?: UserRole) => Promise<void>;
  requestTechnicianSignup: (input: TechnicianSignupInput) => Promise<void>;
  approveTechnicianSignupRequest: (requestId: string) => Promise<void>;
  rejectTechnicianSignupRequest: (requestId: string) => Promise<void>;
  updateTechnicianAccount: (id: string, input: TechnicianAccountUpdateInput) => Promise<void>;
  setTechnicianAccountActive: (id: string, isActive: boolean) => Promise<void>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEY = 'sm_dispatch_auth_user';
const TECHNICIANS_STORAGE_KEY = 'sm_dispatch_technician_accounts';
const TECHNICIAN_SIGNUP_REQUESTS_STORAGE_KEY = 'sm_dispatch_technician_signup_requests';
const ADMIN_EMAIL = currentUser.email.toLowerCase();

const DEFAULT_TECHNICIAN_ACCOUNTS: TechnicianAccount[] = [
  {
    id: technicianUser.id,
    name: technicianUser.name,
    email: technicianUser.email.toLowerCase(),
    phone: technicianUser.phone,
    password: 'tech123',
    avatar: technicianUser.avatar,
    isActive: true,
    createdAt: technicianUser.createdAt,
    updatedAt: technicianUser.updatedAt,
  },
];

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createId(prefix: 'tech' | 'req') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function toTechnicianUser(account: TechnicianAccount): User {
  return {
    id: account.id,
    name: account.name,
    role: 'technician',
    email: account.email,
    phone: account.phone,
    avatar: account.avatar ?? technicianUser.avatar,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toTechnicianSummary(account: TechnicianAccount): TechnicianAccountSummary {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    avatar: account.avatar,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toSignupRequestSummary(request: TechnicianSignupRequest): TechnicianSignupRequestSummary {
  return {
    id: request.id,
    name: request.name,
    email: request.email,
    phone: request.phone,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
  };
}

function mapBackendTechnicianAccounts(
  backendRows: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    status: 'active' | 'deactivated';
  }>,
  previous: TechnicianAccount[],
): TechnicianAccount[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return backendRows.map((row) => {
    const prev = byId.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: normalizeEmail(row.email),
      phone: row.phone ?? undefined,
      password: prev?.password,
      avatar: prev?.avatar ?? technicianUser.avatar,
      isActive: row.status === 'active',
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

function mapBackendPendingRequests(
  backendRows: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    requested_at: string;
    updated_at: string;
  }>,
): TechnicianSignupRequest[] {
  return backendRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: normalizeEmail(row.email),
    phone: row.phone ?? undefined,
    password: '',
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  }));
}

function parseStoredUser(): User | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function parseStoredTechnicians(): TechnicianAccount[] {
  if (typeof window === 'undefined') {
    return DEFAULT_TECHNICIAN_ACCOUNTS;
  }

  const raw = window.localStorage.getItem(TECHNICIANS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_TECHNICIAN_ACCOUNTS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TechnicianAccount>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_TECHNICIAN_ACCOUNTS;
    }

    const validAccounts = parsed
      .map((item): TechnicianAccount | null => {
        if (
          typeof item?.id !== 'string'
          || typeof item?.name !== 'string'
          || typeof item?.email !== 'string'
          || typeof item?.createdAt !== 'string'
          || typeof item?.updatedAt !== 'string'
        ) {
          return null;
        }

        return {
          id: item.id,
          name: item.name,
          email: normalizeEmail(item.email),
          phone: item.phone,
          password: typeof item.password === 'string' ? item.password : undefined,
          avatar: item.avatar,
          isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      })
      .filter((item): item is TechnicianAccount => item !== null)
      .filter((item, index, list) =>
        list.findIndex((candidate) => candidate.id === item.id) === index
      );

    return validAccounts.length > 0 ? validAccounts : DEFAULT_TECHNICIAN_ACCOUNTS;
  } catch {
    window.localStorage.removeItem(TECHNICIANS_STORAGE_KEY);
    return DEFAULT_TECHNICIAN_ACCOUNTS;
  }
}

function parseStoredSignupRequests(): TechnicianSignupRequest[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(TECHNICIAN_SIGNUP_REQUESTS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TechnicianSignupRequest>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    return parsed
      .map((item): TechnicianSignupRequest | null => {
        if (
          typeof item?.id !== 'string'
          || typeof item?.name !== 'string'
          || typeof item?.email !== 'string'
          || typeof item?.password !== 'string'
          || typeof item?.requestedAt !== 'string'
          || typeof item?.updatedAt !== 'string'
        ) {
          return null;
        }

        return {
          id: item.id,
          name: item.name,
          email: normalizeEmail(item.email),
          phone: item.phone,
          password: item.password,
          requestedAt: item.requestedAt,
          updatedAt: item.updatedAt,
        };
      })
      .filter((item): item is TechnicianSignupRequest => item !== null)
      .filter((item, index, list) =>
        list.findIndex((candidate) => candidate.id === item.id) === index
      );
  } catch {
    window.localStorage.removeItem(TECHNICIAN_SIGNUP_REQUESTS_STORAGE_KEY);
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => parseStoredUser());
  const [technicianAccounts, setTechnicianAccounts] = useState<TechnicianAccount[]>(() => parseStoredTechnicians());
  const [pendingTechnicianRequests, setPendingTechnicianRequests] = useState<TechnicianSignupRequest[]>(() => parseStoredSignupRequests());
  const [hasBackendAdminToken, setHasBackendAdminToken] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const token = window.localStorage.getItem('sm_dispatch_admin_access_token');
    return Boolean(token && token.trim());
  });
  const [hasBackendTechnicianToken, setHasBackendTechnicianToken] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const token = window.localStorage.getItem('sm_dispatch_technician_access_token');
    return Boolean(token && token.trim());
  });

  const refreshBackendAdminData = useCallback(async () => {
    const token = getStoredAdminToken();
    if (!token) {
      return;
    }

    const [backendTechnicians, backendPending] = await Promise.all([
      fetchAdminTechnicians(token),
      fetchAdminTechnicianSignupRequests(token, 'pending'),
    ]);

    setTechnicianAccounts((prev) => mapBackendTechnicianAccounts(backendTechnicians, prev));
    setPendingTechnicianRequests(mapBackendPendingRequests(backendPending));
  }, []);

  useEffect(() => {
    if (user?.role !== 'technician') {
      return;
    }

    const account = technicianAccounts.find((item) => item.id === user.id);
    if (!account || !account.isActive) {
      setUser(null);
      return;
    }

    const synced = toTechnicianUser(account);
    const needsSync =
      user.name !== synced.name
      || user.email !== synced.email
      || user.phone !== synced.phone
      || user.updatedAt !== synced.updatedAt;

    if (needsSync) {
      setUser(synced);
    }
  }, [technicianAccounts, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (user) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TECHNICIANS_STORAGE_KEY, JSON.stringify(technicianAccounts));
  }, [technicianAccounts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TECHNICIAN_SIGNUP_REQUESTS_STORAGE_KEY, JSON.stringify(pendingTechnicianRequests));
  }, [pendingTechnicianRequests]);

  useEffect(() => {
    if (!hasBackendAdminToken || user?.role !== 'admin') {
      return;
    }
    void refreshBackendAdminData();
  }, [hasBackendAdminToken, refreshBackendAdminData, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || hasBackendAdminToken) {
      return;
    }
    setUser(null);
  }, [hasBackendAdminToken, refreshBackendAdminData, user]);

  useEffect(() => {
    if (user?.role !== 'technician') {
      return;
    }
    if (hasBackendTechnicianToken) {
      return;
    }
    setUser(null);
  }, [hasBackendTechnicianToken, user?.role]);

  const login = useCallback(async (email: string, password: string, role: UserRole = 'admin') => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Email and password are required.');
    }

    if (role === 'admin') {
      const tokenResponse = await fetchDevAdminToken({
        email: normalizedEmail,
        password: normalizedPassword,
      });
      setStoredAdminToken(tokenResponse.access_token);
      setHasBackendAdminToken(true);
      clearStoredTechnicianToken();
      setHasBackendTechnicianToken(false);
      await refreshBackendAdminData();

      setUser({
        ...currentUser,
        email: normalizedEmail,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const tokenResponse = await fetchDevTechnicianToken({
        email: normalizedEmail,
        password: normalizedPassword,
      });
      setStoredTechnicianToken(tokenResponse.access_token);
      setHasBackendTechnicianToken(true);

      const backendProfile = await fetchTechnicianMeProfile(tokenResponse.access_token);
      const nowIso = new Date().toISOString();
      const backendAccount: TechnicianAccount = {
        id: backendProfile.id,
        name: backendProfile.full_name || backendProfile.name,
        email: normalizeEmail(backendProfile.email),
        phone: backendProfile.phone ?? undefined,
        password: normalizedPassword,
        avatar: backendProfile.profile_picture_url ?? technicianUser.avatar,
        isActive: backendProfile.status === 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setTechnicianAccounts((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === backendAccount.id);
        if (existingIndex === -1) {
          return [backendAccount, ...prev];
        }
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          ...backendAccount,
          createdAt: next[existingIndex].createdAt,
        };
        return next;
      });

      setUser({
        id: backendAccount.id,
        name: backendAccount.name,
        role: 'technician',
        email: backendAccount.email,
        phone: backendAccount.phone,
        avatar: backendAccount.avatar,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return;
    } catch (error) {
      setHasBackendTechnicianToken(false);
      clearStoredTechnicianToken();
      throw (error instanceof Error ? error : new Error('Technician login failed.'));
    }
  }, [refreshBackendAdminData]);

  const requestTechnicianSignup = useCallback(async (input: TechnicianSignupInput) => {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const phone = input.phone?.trim();
    const password = input.password.trim();

    if (!name || !email || !password) {
      throw new Error('Name, email, and password are required.');
    }

    if (email === ADMIN_EMAIL) {
      throw new Error('This email is reserved for the admin account.');
    }

    await createTechnicianSignupRequest({
      name,
      email,
      phone,
      password,
    });

    const token = getStoredAdminToken();
    if (token) {
      await refreshBackendAdminData();
      return;
    }

    const now = new Date().toISOString();
    setPendingTechnicianRequests((prev) => [
      {
        id: createId('req'),
        name,
        email,
        phone,
        password,
        requestedAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
  }, [refreshBackendAdminData]);

  const approveTechnicianSignupRequest = useCallback(async (requestId: string) => {
    const token = getStoredAdminToken();
    if (token) {
      await approveAdminTechnicianSignupRequest(token, requestId);
      await refreshBackendAdminData();
      return;
    }

    const request = pendingTechnicianRequests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error('Signup request not found.');
    }

    const duplicateAccount = technicianAccounts.some(
      (item) => normalizeEmail(item.email) === normalizeEmail(request.email)
    );
    if (duplicateAccount) {
      throw new Error('An account already exists with this email.');
    }

    const now = new Date().toISOString();
    const account: TechnicianAccount = {
      id: createId('tech'),
      name: request.name,
      email: normalizeEmail(request.email),
      phone: request.phone,
      password: request.password,
      avatar: technicianUser.avatar,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    setTechnicianAccounts((prev) => [...prev, account]);
    setPendingTechnicianRequests((prev) => prev.filter((item) => item.id !== requestId));
  }, [pendingTechnicianRequests, refreshBackendAdminData, technicianAccounts]);

  const rejectTechnicianSignupRequest = useCallback(async (requestId: string) => {
    const token = getStoredAdminToken();
    if (token) {
      await rejectAdminTechnicianSignupRequest(token, requestId);
      await refreshBackendAdminData();
      return;
    }

    const request = pendingTechnicianRequests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error('Signup request not found.');
    }

    setPendingTechnicianRequests((prev) => prev.filter((item) => item.id !== requestId));
  }, [pendingTechnicianRequests, refreshBackendAdminData]);

  const updateTechnicianAccount = useCallback(async (id: string, input: TechnicianAccountUpdateInput) => {
    const token = getStoredAdminToken();
    if (token) {
      const existing = technicianAccounts.find((item) => item.id === id);
      if (!existing) {
        throw new Error('Technician account not found.');
      }
      const name = input.name.trim();
      const email = normalizeEmail(input.email);
      const phone = input.phone?.trim();
      const nextPassword = input.password?.trim();

      if (!name || !email) {
        throw new Error('Name and email are required.');
      }

      await updateAdminTechnician(token, id, {
        name,
        email,
        phone: phone || undefined,
        password: nextPassword || undefined,
      });

      setTechnicianAccounts((prev) =>
        prev.map((item) => (
          item.id === id
            ? {
              ...item,
              name,
              email,
              phone,
              password: nextPassword ? nextPassword : item.password,
              updatedAt: new Date().toISOString(),
            }
            : item
        ))
      );

      await refreshBackendAdminData();
      return;
    }

    const existing = technicianAccounts.find((item) => item.id === id);
    if (!existing) {
      throw new Error('Technician account not found.');
    }

    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const phone = input.phone?.trim();
    const nextPassword = input.password?.trim();

    if (!name || !email) {
      throw new Error('Name and email are required.');
    }
    if (email === ADMIN_EMAIL) {
      throw new Error('This email is reserved for the admin account.');
    }

    const duplicateEmail = technicianAccounts.some(
      (item) => item.id !== id && normalizeEmail(item.email) === email
    );
    if (duplicateEmail) {
      throw new Error('Another technician account already uses this email.');
    }

    const pendingConflict = pendingTechnicianRequests.some(
      (request) => normalizeEmail(request.email) === email
    );
    if (pendingConflict) {
      throw new Error('This email is already used by a pending signup request.');
    }

    const now = new Date().toISOString();
    const updated: TechnicianAccount = {
      ...existing,
      name,
      email,
      phone,
      password: nextPassword ? nextPassword : existing.password,
      updatedAt: now,
    };

    setTechnicianAccounts((prev) =>
      prev.map((item) => (item.id === id ? updated : item))
    );
    if (user?.role === 'technician' && user.id === id) {
      setUser(toTechnicianUser(updated));
    }
  }, [pendingTechnicianRequests, refreshBackendAdminData, technicianAccounts, user]);

  const setTechnicianAccountActive = useCallback(async (id: string, isActive: boolean) => {
    const token = getStoredAdminToken();
    if (token) {
      await updateAdminTechnician(token, id, { status: isActive ? 'active' : 'deactivated' });
      await refreshBackendAdminData();
      if (!isActive && user?.role === 'technician' && user.id === id) {
        setUser(null);
      }
      return;
    }

    const existing = technicianAccounts.find((item) => item.id === id);
    if (!existing) {
      throw new Error('Technician account not found.');
    }

    const updated: TechnicianAccount = {
      ...existing,
      isActive,
      updatedAt: new Date().toISOString(),
    };

    setTechnicianAccounts((prev) =>
      prev.map((item) => (item.id === id ? updated : item))
    );

    if (!isActive && user?.role === 'technician' && user.id === id) {
      setUser(null);
    }
  }, [refreshBackendAdminData, technicianAccounts, user]);

  const logout = useCallback(() => {
    setUser(null);
    clearStoredAdminToken();
    clearStoredTechnicianToken();
    setHasBackendAdminToken(false);
    setHasBackendTechnicianToken(false);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    if (role === 'admin') {
      clearStoredTechnicianToken();
      setHasBackendTechnicianToken(false);
      setUser(null);
      return;
    }

    setUser(null);
  }, []);

  const syncAdminData = useCallback(async () => {
    await refreshBackendAdminData();
  }, [refreshBackendAdminData]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isTechnician: user?.role === 'technician',
    hasBackendAdminToken,
    hasBackendTechnicianToken,
    technicianAccounts: technicianAccounts.map(toTechnicianSummary),
    pendingTechnicianRequests: pendingTechnicianRequests.map(toSignupRequestSummary),
    syncAdminData,
    login,
    requestTechnicianSignup,
    approveTechnicianSignupRequest,
    rejectTechnicianSignupRequest,
    updateTechnicianAccount,
    setTechnicianAccountActive,
    logout,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
