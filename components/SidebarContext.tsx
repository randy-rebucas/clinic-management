'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  /** Off-canvas drawer state below the lg breakpoint. */
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Start expanded (the default) so server and client renders match
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // After hydration, load from localStorage or settings
  useEffect(() => {
    // Using setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      setIsHydrated(true);
    }, 0);
    
    // This device's own choice wins; the clinic's default only applies until someone picks one here.
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      setTimeout(() => {
        setIsCollapsed(saved === 'true');
      }, 0);
      return;
    }

    const applyClinicDefault = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          if (typeof settings?.displaySettings?.sidebarCollapsed === 'boolean') {
            setIsCollapsed(settings.displaySettings.sidebarCollapsed);
          }
        }
      } catch {
        // Stay expanded
      }
    };
    applyClinicDefault();
  }, []);

  // Only a person's own toggle is remembered, so the clinic default isn't stored as their choice.
  const choose = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    if (isHydrated) {
      try {
        localStorage.setItem('sidebarCollapsed', String(collapsed));
      } catch {
        // Storage blocked: the choice lasts until reload
      }
    }
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed: choose, isMobileOpen, setIsMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

