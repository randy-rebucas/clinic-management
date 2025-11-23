'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Modal } from './ui/Modal';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface User {
  name: string;
  role: string;
}

interface MobileMenuProps {
  navItems: NavItem[];
  user: User;
}

export default function MobileMenu({ navItems, user }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
        className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile Menu Overlay */}
      <Modal
        open={isOpen}
        onOpenChange={setIsOpen}
        className="max-w-full m-0 fixed top-16 left-0 right-0 bottom-0 rounded-none"
      >
        <div className="flex flex-col gap-2 p-4 h-full overflow-y-auto">
          {/* User Info */}
          <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold block overflow-hidden text-ellipsis whitespace-nowrap">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500 block overflow-hidden text-ellipsis whitespace-nowrap">
                  {user.role}
                </p>
              </div>
            </div>
          </div>

          <hr className="border-gray-300" />

          {/* Navigation Items */}
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  <div
                    className={`p-2 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-transparent border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                      <span className={`text-sm ${isActive ? 'font-bold text-blue-700' : 'font-normal text-gray-600'}`}>
                        {item.label}
                      </span>
                      {isActive && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-blue-600" />
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
