import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CustomerBranding } from '@/lib/customer-api';
import {
  getCustomerLastReference,
  getOrCreateCustomerPortalSessionId,
  setCustomerLastReference,
} from '@/lib/customer-session';

type CustomerPortalContextValue = {
  branding: CustomerBranding;
  brandingError: string | null;
  isBrandingLoaded: boolean;
  sessionId: string;
  lastReferenceNumber: string | null;
  setLastReferenceNumber: (referenceNumber: string | null) => void;
};

const CustomerPortalContext = createContext<CustomerPortalContextValue | undefined>(undefined);

type CustomerPortalProviderProps = {
  branding: CustomerBranding;
  brandingError: string | null;
  isBrandingLoaded: boolean;
  children: ReactNode;
};

export function CustomerPortalProvider({
  branding,
  brandingError,
  isBrandingLoaded,
  children,
}: CustomerPortalProviderProps) {
  const [sessionId] = useState(() => getOrCreateCustomerPortalSessionId());
  const [lastReferenceNumber, setLastReferenceNumberState] = useState<string | null>(() =>
    getCustomerLastReference(),
  );

  useEffect(() => {
    setLastReferenceNumberState(getCustomerLastReference());
  }, []);

  const setLastReferenceNumber = (referenceNumber: string | null) => {
    setLastReferenceNumberState(referenceNumber);
    setCustomerLastReference(referenceNumber);
  };

  return (
    <CustomerPortalContext.Provider
      value={{
        branding,
        brandingError,
        isBrandingLoaded,
        sessionId,
        lastReferenceNumber,
        setLastReferenceNumber,
      }}
    >
      {children}
    </CustomerPortalContext.Provider>
  );
}

export function useCustomerPortal() {
  const context = useContext(CustomerPortalContext);
  if (!context) {
    throw new Error('useCustomerPortal must be used within CustomerPortalProvider');
  }
  return context;
}
