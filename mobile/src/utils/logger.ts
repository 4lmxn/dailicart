/**
 * Production-safe logger utility
 * Only logs in development mode, silent in production
 */

const isDev = __DEV__ || process.env.NODE_ENV === 'development';

type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'info';

interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

const noop = () => {};

const createLogger = (): Logger => {
  if (!isDev) {
    // In production, silence all logs except errors (which go to error tracking)
    return {
      log: noop,
      warn: noop,
      error: (...args: unknown[]) => {
        // In production, errors should go to Sentry/error tracking
        // For now, we'll keep console.error but could replace with Sentry
        console.error('[ERROR]', ...args);
      },
      debug: noop,
      info: noop,
    };
  }

  // In development, log everything with prefixes
  return {
    log: (...args: unknown[]) => console.log('[LOG]', ...args),
    warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
    debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
    info: (...args: unknown[]) => console.info('[INFO]', ...args),
  };
};

export const logger = createLogger();

// Named exports for convenience
export const { log, warn, error, debug, info } = logger;

// Default export
export default logger;
