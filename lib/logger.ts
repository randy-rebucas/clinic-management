/**
 * Production-ready logging utility
 * In production, logs should be sent to a logging service
 * For now, we use structured logging with proper levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatLog(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context && { context }),
      ...(error && { 
        error: {
          name: error.name,
          message: error.message,
          stack: this.isDevelopment ? error.stack : undefined,
        },
      }),
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    const logEntry = this.formatLog(level, message, context, error);
    
    // In production, you should send logs to a logging service
    // For now, we use console with structured output
    if (this.isProduction) {
      // In production, only log errors and warnings
      if (level === 'error' || level === 'warn') {
        console.error(JSON.stringify(logEntry));
      }
    } else {
      // In development, log everything with colors
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m',  // Green
        warn: '\x1b[33m',  // Yellow
        error: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';
      
      console.log(`${colors[level]}${level.toUpperCase()}${reset}`, logEntry);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);

    if (errorReporter && error) {
      try {
        errorReporter(error, message, pickReportableContext(context));
      } catch {
        // Error reporting must never break the caller.
      }
    }
  }
}

export type ErrorReporter = (error: Error, message: string, context: Record<string, string>) => void;

let errorReporter: ErrorReporter | null = null;

/** Registered by instrumentation.ts only when Sentry is configured; otherwise errors are just logged. */
export function setErrorReporter(reporter: ErrorReporter | null): void {
  errorReporter = reporter;
}

// Log context can hold anything (including patient data), so only these identifiers are reported.
const REPORTABLE_CONTEXT_KEYS = ['path', 'method', 'route', 'routePath', 'routeType', 'digest', 'tenantId', 'userId', 'jobId', 'automation'];

function pickReportableContext(context?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!context) return out;
  for (const key of REPORTABLE_CONTEXT_KEYS) {
    const value = context[key];
    if (typeof value === 'string' || typeof value === 'number') {
      out[key] = key === 'path' || key === 'route' ? String(value).split('?')[0] : String(value);
    }
  }
  return out;
}

// Export singleton instance
export const logger = new Logger();

// Export for convenience
export default logger;

