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
    
    // Send to monitoring service if available
    if (this.isProduction && error) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { monitoring } = require('./monitoring');
        if (monitoring.isEnabled()) {
          monitoring.captureException(error, {
            message,
            ...context,
          });
        }
      } catch {
        // Monitoring not available, continue without it
      }
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for convenience
export default logger;

