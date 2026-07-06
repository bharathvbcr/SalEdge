import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    private handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    public render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-bg-primary p-8">
                    <div className="bg-bg-secondary rounded-xl p-8 max-w-md text-center shadow-xl border border-border-color animate-slide-up">
                        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-status-red-bg flex items-center justify-center text-2xl">
                            ⚠️
                        </div>
                        <h1 className="text-xl font-bold text-text-primary mb-2">
                            Something went wrong
                        </h1>
                        <p className="text-text-secondary text-sm mb-4">
                            The application encountered an unexpected error.
                        </p>
                        {this.state.error && (
                            <details className="text-left mb-4 p-3 bg-bg-tertiary rounded-lg border border-border-color">
                                <summary className="text-sm text-text-muted cursor-pointer font-medium">
                                    Error Details
                                </summary>
                                <pre className="text-xs text-status-red-text mt-2 overflow-auto whitespace-pre-wrap">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}
                        <div className="flex gap-3 justify-center">
                            <button onClick={this.handleReset} className="btn-primary">
                                Try Again
                            </button>
                            <button onClick={() => window.location.reload()} className="btn-secondary">
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
