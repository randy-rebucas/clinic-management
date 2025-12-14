'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import logger from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for catching React errors
 * Wrap your components with this to prevent the entire app from crashing
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to logging service
    logger.error('Error caught by ErrorBoundary', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-red-50/30 p-4">
          <div className="max-w-md w-full bg-white shadow-xl rounded-xl border border-gray-200 p-8">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-gradient-to-br from-red-500 to-red-600 rounded-full mb-6 shadow-md">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
              Something went wrong
            </h2>
            <p className="text-gray-600 text-center mb-6 font-medium">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 mb-6">
                <summary className="cursor-pointer text-sm font-semibold text-gray-700 mb-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100">
                  Error details (development only)
                </summary>
                <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto border border-gray-700">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full mt-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-md"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

