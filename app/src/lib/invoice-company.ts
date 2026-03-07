export interface InvoiceCompanyProfile {
  logo_url?: string;
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
  website: string;
}

export const INVOICE_COMPANY_PROFILE_STORAGE_KEY = 'sm_dispatch_invoice_company_profile';

export const DEFAULT_INVOICE_COMPANY_PROFILE: InvoiceCompanyProfile = {
  name: 'SM2 Dispatch',
  street_address: '123 Dispatch Ave',
  city: 'Quebec',
  state: 'QC',
  zip_code: 'G1A 1A1',
  phone: '+1-418-555-0100',
  email: 'billing@sm2dispatch.com',
  website: 'https://www.sm2dispatch.com',
};

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const loadInvoiceCompanyProfile = (): InvoiceCompanyProfile => {
  if (typeof window === 'undefined') return { ...DEFAULT_INVOICE_COMPANY_PROFILE };

  try {
    const raw = window.localStorage.getItem(INVOICE_COMPANY_PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INVOICE_COMPANY_PROFILE };

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      logo_url: readString(parsed.logo_url),
      name: readString(parsed.name) ?? DEFAULT_INVOICE_COMPANY_PROFILE.name,
      street_address: readString(parsed.street_address) ?? DEFAULT_INVOICE_COMPANY_PROFILE.street_address,
      city: readString(parsed.city) ?? DEFAULT_INVOICE_COMPANY_PROFILE.city,
      state: readString(parsed.state) ?? DEFAULT_INVOICE_COMPANY_PROFILE.state,
      zip_code: readString(parsed.zip_code) ?? DEFAULT_INVOICE_COMPANY_PROFILE.zip_code,
      phone: readString(parsed.phone) ?? DEFAULT_INVOICE_COMPANY_PROFILE.phone,
      email: readString(parsed.email) ?? DEFAULT_INVOICE_COMPANY_PROFILE.email,
      website: readString(parsed.website) ?? DEFAULT_INVOICE_COMPANY_PROFILE.website,
    };
  } catch {
    return { ...DEFAULT_INVOICE_COMPANY_PROFILE };
  }
};

export const saveInvoiceCompanyProfile = (profile: InvoiceCompanyProfile): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INVOICE_COMPANY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
};
