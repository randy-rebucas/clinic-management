'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Card, Flex, Box, Text, Avatar, Separator, Dialog } from '@radix-ui/themes';

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
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
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
      </Button>

      {/* Mobile Menu Overlay */}
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Content style={{ maxWidth: '100vw', margin: 0, position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0, borderRadius: 0 }}>
          <Flex direction="column" gap="2" p="4">
            {/* User Info */}
            <Card size="2" style={{ background: 'var(--blue-3)' }}>
              <Flex align="center" gap="3">
                <Avatar
                  size="3"
                  fallback={user.name.charAt(0).toUpperCase()}
                  style={{ background: 'var(--blue-9)' }}
                />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="2" weight="bold" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name}
                  </Text>
                  <Text size="1" color="gray" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.role}
                  </Text>
                </Box>
              </Flex>
            </Card>

            <Separator />

            {/* Navigation Items */}
            <Flex direction="column" gap="1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                  >
                    <Card
                      size="1"
                      style={{
                        background: isActive ? 'var(--blue-3)' : 'transparent',
                        border: isActive ? '1px solid var(--blue-6)' : '1px solid transparent',
                      }}
                    >
                      <Flex align="center" gap="3">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                        <Text size="2" weight={isActive ? 'bold' : 'regular'} color={isActive ? 'blue' : 'gray'}>
                          {item.label}
                        </Text>
                        {isActive && (
                          <Box style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--blue-9)' }} />
                        )}
                      </Flex>
                    </Card>
                  </Link>
                );
              })}
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}

