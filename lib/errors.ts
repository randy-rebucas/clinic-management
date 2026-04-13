/**
 * Centralized error handling utilities for API interactions
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  isNotFoundError(): boolean {
    return this.status === 404;
  }

  isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }

  isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Parse API response and throw ApiError on failure
 * Handles JSON parsing, content-type validation, and error extraction
 */
export async function parseApiResponse<T>(
  response: Response,
): Promise<{ success: boolean; data?: T; error?: string; pagination?: any }> {
  // Check status for errors first
  if (!response.ok && response.status !== 200) {
    // Try to parse error message
    const contentType = response.headers.get('content-type');
    let errorMessage = response.statusText;

    if (contentType?.includes('application/json')) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || response.statusText;
      } catch {
        // JSON parse failed, use status text
      }
    }

    throw new ApiError(response.status, errorMessage);
  }

  // Parse JSON response
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await response.text();
    throw new ApiError(
      response.status,
      'API returned non-JSON response',
      text.substring(0, 500),
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ApiError(response.status, 'Failed to parse JSON response', error);
  }
}

/**
 * Type-safe wrapper for async operations with standard error handling
 * Useful for mutations (delete, create, update)
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  options: {
    onError?: (error: ApiError) => void;
    onSuccess?: (data: T) => void;
  } = {},
): Promise<{ success: boolean; data?: T; error?: ApiError }> {
  try {
    const data = await operation();
    options.onSuccess?.(data);
    return { success: true, data };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError(500, 'Unknown error', error);
    options.onError?.(apiError);
    return { success: false, error: apiError };
  }
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: ApiError): string {
  if (error.isAuthError()) {
    return 'Your session has expired. Please log in again.';
  }
  if (error.isNotFoundError()) {
    return 'The requested item was not found.';
  }
  if (error.isValidationError()) {
    return error.message || 'Please check your input and try again.';
  }
  if (error.isServerError()) {
    return 'Server error. Please try again later.';
  }
  if (error.isNetworkError()) {
    return 'Network error. Please check your connection and try again.';
  }
  return error.message || 'An unexpected error occurred.';
}
