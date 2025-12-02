import { useState, useEffect, useCallback, useRef } from 'react';

type SetValue<T> = T | ((val: T) => T);

/**
 * Custom hook for persistent localStorage state with SSR support and debounced writes
 * @param key The localStorage key
 * @param initialValue The initial value if no value exists in localStorage
 * @returns A stateful value and a function to update it
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Ref to track pending writes for debouncing
  const writeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingValueRef = useRef<T | null>(null);

  // Check if we're in the browser environment
  const isBrowser = typeof window !== 'undefined';

  // Initialize state from localStorage or use initialValue
  useEffect(() => {
    if (!isBrowser) return;

    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(parseJSON(item));
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
    }
  }, [key, isBrowser]);

  // Cleanup pending writes on unmount
  useEffect(() => {
    return () => {
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
        // Flush pending write immediately on unmount
        if (pendingValueRef.current !== null && isBrowser) {
          try {
            window.localStorage.setItem(key, JSON.stringify(pendingValueRef.current));
          } catch (error) {
            console.error(`Error flushing localStorage key "${key}":`, error);
          }
        }
      }
    };
  }, [key, isBrowser]);

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage with debouncing.
  const setValue = useCallback((value: SetValue<T>) => {
    if (!isBrowser) return;

    try {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;

        // Update state immediately for responsive UI
        // But debounce the localStorage write to reduce I/O

        // Clear existing timeout
        if (writeTimeoutRef.current) {
          clearTimeout(writeTimeoutRef.current);
        }

        // Store pending value
        pendingValueRef.current = valueToStore;

        // Debounce localStorage write by 500ms
        writeTimeoutRef.current = setTimeout(() => {
          try {
            if (valueToStore === undefined) {
              window.localStorage.removeItem(key);
            } else {
              window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
            pendingValueRef.current = null;
          } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
          }
        }, 500);

        return valueToStore;
      });
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, isBrowser]);

  return [storedValue, setValue] as const;
}

// Helper function to parse JSON with error handling
function parseJSON<T>(value: string): T {
  try {
    return JSON.parse(value);
  } catch {
    console.error('Error parsing JSON from localStorage');
    return {} as T;
  }
}

/**
 * A hook to get a value from localStorage (read-only) with SSR support
 * @param key The localStorage key
 * @param defaultValue The default value if the key doesn't exist
 * @returns The value from localStorage or the default value
 */
export function useLocalStorageValue<T>(key: string, defaultValue: T): T {
  const [value] = useLocalStorage<T>(key, defaultValue);
  return value;
} 
