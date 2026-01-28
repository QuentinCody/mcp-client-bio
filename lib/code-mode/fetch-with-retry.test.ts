/**
 * Tests for fetch-with-retry module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, formatRetryError, type FetchWithRetryResult } from './fetch-with-retry';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('returns result on first successful attempt', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"result": "success"}'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithRetry('https://test.com', { method: 'POST' });

      expect(result.error).toBeUndefined();
      expect(result.parsed).toEqual({ result: 'success' });
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns non-JSON text response correctly', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('plain text response'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithRetry('https://test.com', { method: 'GET' });

      expect(result.error).toBeUndefined();
      expect(result.text).toBe('plain text response');
      expect(result.parsed).toBeNull();
      expect(result.attempts).toBe(1);
    });
  });

  describe('retry on transient errors', () => {
    it('retries on network error and succeeds', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"result": "success"}'),
      };

      mockFetch
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(mockResponse);

      const resultPromise = fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 100 });

      // Fast-forward through retries
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.error).toBeUndefined();
      expect(result.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server error', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
      };
      const successResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"result": "success"}'),
      };

      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 100 });

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.error).toBeUndefined();
      expect(result.attempts).toBe(2);
    });

    it('retries on 429 rate limit', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('{"error": "Rate limit exceeded"}'),
      };
      const successResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"result": "success"}'),
      };

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const resultPromise = fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 100 });

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.error).toBeUndefined();
      expect(result.attempts).toBe(2);
    });
  });

  describe('non-retryable errors', () => {
    it('does not retry on 400 client error', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('{"error": "Bad request"}'),
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2 });

      expect(result.error).toBe('Bad request');
      expect(result.errorCode).toBe('CLIENT_ERROR');
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 404 not found', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Not Found'),
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2 });

      expect(result.error).toBe('Not Found');
      expect(result.errorCode).toBe('CLIENT_ERROR');
      expect(result.attempts).toBe(1);
    });
  });

  describe('exhausted retries', () => {
    it('returns error after all retries exhausted', async () => {
      mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));

      const resultPromise = fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 100 });

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.error).toContain('ETIMEDOUT');
      expect(result.errorCode).toBe('NETWORK_ERROR');
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('returns server error after all retries', async () => {
      const errorResponse = {
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service Unavailable'),
      };

      mockFetch.mockResolvedValue(errorResponse);

      const resultPromise = fetchWithRetry('https://test.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 100 });

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.error).toBe('Service Unavailable');
      expect(result.errorCode).toBe('SERVER_ERROR');
      expect(result.attempts).toBe(3);
    });
  });
});

describe('formatRetryError', () => {
  it('formats timeout error correctly', () => {
    const result: FetchWithRetryResult = {
      error: 'Request timed out',
      errorCode: 'TIMEOUT',
      attempts: 3,
      totalTimeMs: 90000,
    };

    const formatted = formatRetryError(result);

    expect(formatted.error).toContain('timed out');
    expect(formatted.error).toContain('3 attempts');
    expect(formatted.recoverable).toBe(true);
    expect(formatted.details).toContain('simpler query');
  });

  it('formats rate limit error correctly', () => {
    const result: FetchWithRetryResult = {
      error: 'Rate limit exceeded',
      errorCode: 'RATE_LIMITED',
      attempts: 2,
      totalTimeMs: 5000,
    };

    const formatted = formatRetryError(result);

    expect(formatted.error).toContain('Rate limit');
    expect(formatted.recoverable).toBe(true);
    expect(formatted.details).toContain('Wait');
  });

  it('formats server error correctly', () => {
    const result: FetchWithRetryResult = {
      error: 'Internal server error',
      errorCode: 'SERVER_ERROR',
      attempts: 3,
      totalTimeMs: 15000,
    };

    const formatted = formatRetryError(result);

    expect(formatted.error).toContain('Server error');
    expect(formatted.recoverable).toBe(true);
    expect(formatted.details).toContain('temporary');
  });

  it('formats network error correctly', () => {
    const result: FetchWithRetryResult = {
      error: 'ECONNREFUSED',
      errorCode: 'NETWORK_ERROR',
      attempts: 3,
      totalTimeMs: 20000,
    };

    const formatted = formatRetryError(result);

    expect(formatted.error).toContain('Network error');
    expect(formatted.recoverable).toBe(true);
    expect(formatted.details).toContain('connection');
  });

  it('formats client error as non-recoverable', () => {
    const result: FetchWithRetryResult = {
      error: 'Bad request',
      errorCode: 'CLIENT_ERROR',
      attempts: 1,
      totalTimeMs: 500,
    };

    const formatted = formatRetryError(result);

    expect(formatted.error).toBe('Bad request');
    expect(formatted.recoverable).toBe(false);
    expect(formatted.details).toContain('rejected');
  });
});
