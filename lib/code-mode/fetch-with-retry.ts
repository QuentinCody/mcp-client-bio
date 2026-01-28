/**
 * Fetch with retry logic for Code Mode sandbox
 *
 * Implements exponential backoff for transient network errors
 * while failing fast on non-recoverable errors.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface FetchWithRetryResult {
  response?: Response;
  text?: string;
  parsed?: any;
  error?: string;
  errorCode?: 'TIMEOUT' | 'NETWORK_ERROR' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'CLIENT_ERROR';
  attempts: number;
  totalTimeMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 2,         // Total of 3 attempts (1 initial + 2 retries)
  baseDelayMs: 500,      // Start with 500ms delay
  maxDelayMs: 5000,      // Cap at 5 seconds
  timeoutMs: 30000,      // 30 second timeout per request
};

/**
 * Determines if an error is transient and should be retried
 */
function isRetryableError(error: any, status?: number): boolean {
  // Network errors are generally retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Connection errors
  const retryableMessages = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'socket hang up',
    'network error',
    'Failed to fetch',
  ];

  const errorMsg = error?.message || String(error);
  if (retryableMessages.some(msg => errorMsg.includes(msg))) {
    return true;
  }

  // HTTP status-based retry decisions
  if (status) {
    // Retry on rate limiting (429) and server errors (5xx)
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);

  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry for transient errors
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: Partial<RetryConfig> = {}
): Promise<FetchWithRetryResult> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: any = null;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      // Wait before retry (not on first attempt)
      if (attempt > 0) {
        const delay = calculateDelay(attempt - 1, cfg);
        await sleep(delay);
      }

      const response = await fetchWithTimeout(url, options, cfg.timeoutMs);
      const text = await response.text();

      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON, that's okay
      }

      // Success - return immediately
      if (response.ok) {
        return {
          response,
          text,
          parsed,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Non-OK response - check if retryable
      lastStatus = response.status;
      lastError = parsed?.error || text || `HTTP ${response.status}`;

      if (!isRetryableError(null, response.status) || attempt === cfg.maxRetries) {
        // Not retryable or out of retries - return error
        let errorCode: FetchWithRetryResult['errorCode'] = 'CLIENT_ERROR';
        if (response.status === 429) errorCode = 'RATE_LIMITED';
        else if (response.status >= 500) errorCode = 'SERVER_ERROR';

        return {
          response,
          text,
          parsed,
          error: lastError,
          errorCode,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Retryable - continue to next attempt

    } catch (error: any) {
      lastError = error;

      // Check if it's an abort (timeout)
      if (error.name === 'AbortError') {
        lastError = `Request timed out after ${cfg.timeoutMs}ms`;

        // Timeout on last attempt
        if (attempt === cfg.maxRetries) {
          return {
            error: lastError,
            errorCode: 'TIMEOUT',
            attempts: attempt + 1,
            totalTimeMs: Date.now() - startTime,
          };
        }
        // Otherwise retry
        continue;
      }

      // Check if retryable network error
      if (!isRetryableError(error) || attempt === cfg.maxRetries) {
        return {
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'NETWORK_ERROR',
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Retryable - continue to next attempt
    }
  }

  // Shouldn't reach here, but just in case
  return {
    error: lastError instanceof Error ? lastError.message : String(lastError),
    errorCode: 'NETWORK_ERROR',
    attempts: cfg.maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Format error result for user display
 */
export function formatRetryError(result: FetchWithRetryResult): {
  error: string;
  details: string;
  recoverable: boolean;
} {
  const attemptInfo = result.attempts > 1
    ? ` (after ${result.attempts} attempts)`
    : '';

  switch (result.errorCode) {
    case 'TIMEOUT':
      return {
        error: `Request timed out${attemptInfo}`,
        details: 'The code execution took too long. Try a simpler query or break it into smaller parts.',
        recoverable: true,
      };

    case 'RATE_LIMITED':
      return {
        error: `Rate limit exceeded${attemptInfo}`,
        details: 'Too many requests. Wait a moment before trying again.',
        recoverable: true,
      };

    case 'SERVER_ERROR':
      return {
        error: `Server error${attemptInfo}`,
        details: 'The code execution service encountered an error. This is usually temporary.',
        recoverable: true,
      };

    case 'NETWORK_ERROR':
      return {
        error: `Network error${attemptInfo}`,
        details: 'Could not connect to the code execution service. Check your connection.',
        recoverable: true,
      };

    case 'CLIENT_ERROR':
    default:
      return {
        error: result.error || 'Unknown error',
        details: 'The request was rejected. Check the code for issues.',
        recoverable: false,
      };
  }
}
