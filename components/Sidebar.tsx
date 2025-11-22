'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';
import { useSidebar } from './SidebarContext';
import { Box, Button, Text, Flex, Card } from '@radix-ui/themes';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  category?: string;
  adminOnly?: boolean;
}

interface SidebarProps {
  navItems: NavItem[];
  user: {
    name: string;
    role: string;
  } | null;
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const pathname = usePathname();

  // Filter items based on user role (admin-only items)
  const filteredItems = navItems.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') {
      return false;
    }
    return true;
  });

  // Group items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  // If no user, don't render sidebar (will redirect to login)
  if (!user) {
    return null;
  }

  return (
    <Box
      position="fixed"
      left="0"
      top="0"
      height="100vh"
      width={isCollapsed ? '56px' : '280px'}
      style={{
        backgroundColor: 'white',
        borderRight: '1px solid var(--gray-6)',
        transition: 'width 300ms ease',
        zIndex: 40,
      }}
    >
      <Flex
        direction="column"
        height="100%"
      >
        {/* Logo and Toggle */}
        <Flex
          align="center"
          justify="between"
          height="56px"
          px="3"
          style={{
            borderBottom: '1px solid var(--gray-6)',
          }}
        >
          {!isCollapsed && (
            <Link href="/" style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                <Box
                  width="28px"
                  height="28px"
                  style={{
                    borderRadius: 'var(--radius-2)',
                    background: 'linear-gradient(to bottom right, var(--blue-9), var(--blue-10))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </Box>
                <Text
                  size="3"
                  weight="bold"
                  style={{
                    background: 'linear-gradient(to right, var(--blue-10), var(--blue-11))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ClinicHub
                </Text>
              </Flex>
            </Link>
          )}
          {isCollapsed && (
            <Box
              width="28px"
              height="28px"
              mx="auto"
              style={{
                borderRadius: 'var(--radius-2)',
                background: 'linear-gradient(to bottom right, var(--blue-9), var(--blue-10))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </Box>
          )}
          <Button
            onClick={() => setIsCollapsed(!isCollapsed)}
            variant="ghost"
            size="1"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
              />
            </svg>
          </Button>
        </Flex>

        {/* Navigation Items */}
        <Box
          flexGrow="1"
          style={{ overflowY: 'auto' }}
          py="3"
          px="2"
        >
          <Flex direction="column" gap="0">
          {Object.entries(groupedItems).map(([category, items]) => (
            <Box key={category}>
              {!isCollapsed && items.length > 0 && (
                <Box px="3" py="2">
                  <Text size="2" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {category}
                  </Text>
                </Box>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Box key={item.href} px="2">
                    <Link
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-2)',
                        textDecoration: 'none',
                        backgroundColor: isActive ? 'var(--blue-3)' : 'transparent',
                        color: isActive ? 'var(--blue-11)' : 'var(--gray-11)',
                        fontWeight: isActive ? '500' : 'normal',
                        transition: 'background-color 150ms, color 150ms',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--gray-3)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <Box
                        width="18px"
                        height="18px"
                        flexShrink="0"
                        style={{
                          color: isActive ? 'var(--blue-9)' : 'var(--gray-9)',
                        }}
                      >
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={item.icon}
                          />
                        </svg>
                      </Box>
                      {!isCollapsed && (
                        <>
                          <Box flexGrow="1" style={{ minWidth: 0 }}>
                            <Text
                              size="3"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.label}
                            </Text>
                          </Box>
                          {isActive && (
                            <Box
                              width="6px"
                              height="6px"
                              style={{
                                borderRadius: '50%',
                                background: 'var(--blue-9)',
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </>
                      )}
                    </Link>
                  </Box>
                );
              })}
            </Box>
          ))}
          </Flex>
        </Box>

        {/* User Info and Logout - Footer */}
        <Box
          style={{
            borderTop: '1px solid var(--gray-6)',
            backgroundColor: 'var(--gray-2)',
          }}
        >
          {!isCollapsed ? (
            <Box p="3">
              <Card size="2" mb="2">
                <Flex align="center" gap="3">
                  <Box
                    width="40px"
                    height="40px"
                    style={{
                      borderRadius: '50%',
                      background: 'var(--blue-9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      flexShrink: 0,
                    }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </Box>
                  <Box flexGrow="1" style={{ minWidth: 0 }}>
                    <Text
                      size="2"
                      weight="medium"
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.name}
                    </Text>
                    <Text
                      size="2"
                      color="gray"
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.role}
                    </Text>
                  </Box>
                </Flex>
              </Card>
              <LogoutButton collapsed={false} />
            </Box>
          ) : (
            <Flex direction="column" align="center" gap="2" py="2">
              <Box
                width="32px"
                height="32px"
                style={{
                  borderRadius: '50%',
                  background: 'linear-gradient(to bottom right, var(--blue-9), var(--blue-10))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </Box>
              <LogoutButton collapsed={true} />
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

