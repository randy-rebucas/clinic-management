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
  errorInfo: ErrorInfo | null;
  errorTimestamp: Date | null;
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
      errorInfo: null,
      errorTimestamp: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorTimestamp: new Date(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Store error info for detailed display
    this.setState({
      errorInfo,
    });

    // Log error to logging service
    logger.error('Error caught by ErrorBoundary', error, {
      componentStack: errorInfo.componentStack,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo, errorTimestamp } = this.state;
    if (!error) return;

    const errorDetails = {
      timestamp: errorTimestamp?.toISOString() || new Date().toISOString(),
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A',
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
    };

    const errorText = `Error Details:
Timestamp: ${errorDetails.timestamp}
Error Name: ${errorDetails.errorName}
Error Message: ${errorDetails.errorMessage}
URL: ${errorDetails.url}
User Agent: ${errorDetails.userAgent}

Stack Trace:
${errorDetails.errorStack || 'No stack trace available'}

Component Stack:
${errorDetails.componentStack || 'No component stack available'}`;

    try {
      await navigator.clipboard.writeText(errorText);
      // Show feedback (you could use a toast library here)
      const button = document.getElementById('copy-error-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          if (button) button.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, errorTimestamp } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-red-50/30 p-4">
          <div className={`${isDevelopment ? 'max-w-4xl' : 'max-w-md'} w-full bg-white shadow-xl rounded-xl border border-gray-200 p-8`}>
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
              We&apos;re sorry, but something unexpected happened. Please try refreshing the page.
            </p>

            {error && (
              <div className="space-y-4">
                {/* Basic Error Information - Always visible */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-red-900 mb-2">Error Information</h3>
                    {errorTimestamp && (
                      <span className="text-xs text-red-700">
                        {errorTimestamp.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-semibold text-red-800">Type:</span>
                      <span className="ml-2 text-red-700">{error.name || 'Unknown Error'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-red-800">Message:</span>
                      <p className="mt-1 text-red-700 break-words">{error.message || 'No error message available'}</p>
                    </div>
                  </div>
                </div>

                {/* Detailed Error Information - Expandable */}
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700 mb-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between">
                    <span>View Detailed Error Information</span>
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </summary>
                  
                  <div className="mt-3 space-y-4">
                    {/* Stack Trace */}
                    {error.stack && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stack Trace</h4>
                          <button
                            onClick={this.handleCopyError}
                            id="copy-error-btn"
                            className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 transition-colors"
                          >
                            Copy All
                          </button>
                        </div>
                        <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto border border-gray-700 max-h-64 font-mono">
                          {error.stack}
                        </pre>
                      </div>
                    )}

                    {/* Component Stack */}
                    {errorInfo?.componentStack && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Component Stack</h4>
                        <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto border border-gray-700 max-h-64 font-mono whitespace-pre-wrap">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}

                    {/* Additional Debug Information (Development only) */}
                    {isDevelopment && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-yellow-900 uppercase tracking-wide mb-2">
                          Debug Information (Development Mode)
                        </h4>
                        <div className="space-y-1 text-xs text-yellow-800">
                          <div>
                            <span className="font-semibold">URL:</span>
                            <span className="ml-2 break-all">
                              {typeof window !== 'undefined' ? window.location.href : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold">User Agent:</span>
                            <span className="ml-2 break-all">
                              {typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold">Error Object:</span>
                            <pre className="mt-1 p-2 bg-yellow-100 rounded text-xs overflow-auto max-h-32">
                              {JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null, errorTimestamp: null });
                  window.location.reload();
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-md"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null, errorTimestamp: null });
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-300 transition-all font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

