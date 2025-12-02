'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface TenantContextType {
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  isLoading: true,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get tenant info from cookie (set by middleware)
    const slug = document.cookie
      .split('; ')
      .find(row => row.startsWith('tenant-slug='))
      ?.split('=')[1] || null;

    if (slug) {
      setTenantSlug(slug);
      // Fetch full tenant info from API
      fetch(`/api/tenant/info?slug=${slug}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.tenant) {
            setTenantId(data.tenant._id);
            setTenantName(data.tenant.name);
          }
        })
        .catch(err => console.error('Error fetching tenant info:', err))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  return (
    <TenantContext.Provider value={{ tenantId, tenantSlug, tenantName, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

