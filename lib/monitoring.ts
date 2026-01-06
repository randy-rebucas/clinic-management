/**
 * Application Monitoring Integration
 * Supports Sentry for error tracking and performance monitoring
 */

 
type SentryType = any;

interface MonitoringConfig {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
   
  beforeSend?: (event: any) => any | null;
}

class Monitoring {
  private sentry: SentryType | null = null;
  private config: MonitoringConfig;
  private initialized = false;

  constructor() {
    this.config = {
      enabled: !!process.env.SENTRY_DSN,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    };
  }

  /**
   * Initialize monitoring service (Sentry)
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    try {
      // Dynamically import Sentry to avoid requiring it if not configured
      // Use dynamic import to handle missing package gracefully
      let Sentry: SentryType;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Sentry = require('@sentry/nextjs');
      } catch {
        // Package not installed, monitoring will be disabled
        console.warn('⚠️  Sentry package not installed. Install with: npm install @sentry/nextjs');
        this.config.enabled = false;
        return;
      }
      
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        tracesSampleRate: this.config.tracesSampleRate,
         
        beforeSend: (event: any) => {
          // Filter out sensitive data
          if (event.request) {
            // Remove sensitive headers
            if (event.request.headers) {
              delete event.request.headers['authorization'];
              delete event.request.headers['cookie'];
              delete event.request.headers['x-api-key'];
            }
            // Remove sensitive query params
            if (event.request.query_string) {
              const params = new URLSearchParams(event.request.query_string);
              params.delete('password');
              params.delete('token');
              params.delete('secret');
              event.request.query_string = params.toString();
            }
          }
          
          // Remove sensitive user data
          if (event.user) {
            delete event.user.email;
            delete event.user.ip_address;
          }
          
          return event;
        },
        // Only capture errors in production
        enabled: process.env.NODE_ENV === 'production',
      });

      this.sentry = Sentry;
      this.initialized = true;
      console.log('✅ Monitoring (Sentry) initialized');
    } catch (error) {
      console.warn('⚠️  Failed to initialize Sentry:', error);
      // Don't throw - monitoring should not break the application
    }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    try {
      if (this.sentry) {
        if (context) {
          this.sentry.setContext('additional', context);
        }
        this.sentry.captureException(error);
      }
    } catch (err) {
      // Don't throw - monitoring should not break the application
      console.warn('Failed to capture exception:', err);
    }
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    try {
      if (this.sentry) {
        if (context) {
          this.sentry.setContext('additional', context);
        }
        this.sentry.captureMessage(message, level);
      }
    } catch (err) {
      console.warn('Failed to capture message:', err);
    }
  }

  /**
   * Set user context
   */
  setUser(user: { id?: string; email?: string; username?: string }): void {
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    try {
      if (this.sentry) {
        // Only set safe user identifiers (no PII in production)
        this.sentry.setUser({
          id: user.id,
          // Don't set email in production for privacy
          username: process.env.NODE_ENV === 'production' ? undefined : user.username,
        });
      }
    } catch (err) {
      console.warn('Failed to set user context:', err);
    }
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(message: string, category: string, level: 'info' | 'warning' | 'error' = 'info', data?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.initialized) {
      return;
    }

    try {
      if (this.sentry) {
        this.sentry.addBreadcrumb({
          message,
          category,
          level,
          data,
        });
      }
    } catch (err) {
      console.warn('Failed to add breadcrumb:', err);
    }
  }

  /**
   * Start a transaction for performance monitoring
   */
   
  startTransaction(name: string, op: string): any {
    if (!this.config.enabled || !this.initialized || !this.sentry) {
      return null;
    }

    try {
      return this.sentry.startTransaction({ name, op });
    } catch (err) {
      console.warn('Failed to start transaction:', err);
      return null;
    }
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }
}

// Export singleton instance
export const monitoring = new Monitoring();

// Initialize on import (only in server-side code)
if (typeof window === 'undefined') {
  monitoring.initialize().catch((err) => {
    console.warn('Failed to initialize monitoring:', err);
  });
}

export default monitoring;
