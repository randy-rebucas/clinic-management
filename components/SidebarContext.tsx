'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Always start with false (expanded) to match server render
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // After hydration, load from localStorage or settings
  useEffect(() => {
    // Using setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      setIsHydrated(true);
    }, 0);
    
    // First, try to load from localStorage
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }

    // Then sync with settings
    const syncWithSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          if (settings?.displaySettings?.sidebarCollapsed !== undefined) {
            setIsCollapsed(settings.displaySettings.sidebarCollapsed);
            // Update localStorage to match settings
            localStorage.setItem('sidebarCollapsed', String(settings.displaySettings.sidebarCollapsed));
          }
        }
      } catch (error) {
        // Silently fail - use localStorage value
      }
    };
    syncWithSettings();
  }, []);

  // Save to localStorage when changed (only after hydration)
  useEffect(() => {
    if (isHydrated && typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', String(isCollapsed));
    }
  }, [isCollapsed, isHydrated]);

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed }}>
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

