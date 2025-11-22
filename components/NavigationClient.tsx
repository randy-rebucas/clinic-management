'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Flex, Box, Text } from '@radix-ui/themes';

interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

interface NavigationClientProps {
  navItems: NavItem[];
}

export default function NavigationClient({ navItems }: NavigationClientProps) {
  const pathname = usePathname();

  return (
    <>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <Button
              variant={isActive ? 'solid' : 'ghost'}
              color={isActive ? 'blue' : 'gray'}
              size="2"
              style={{
                width: '100%',
                justifyContent: 'flex-start',
              }}
            >
              <Flex align="center" gap="2">
                {item.icon && (
                  <Box
                    width="16px"
                    height="16px"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                  </Box>
                )}
                <Text size="2">{item.label}</Text>
              </Flex>
            </Button>
          </Link>
        );
      })}
    </>
  );
}

