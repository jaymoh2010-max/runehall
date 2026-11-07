import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, ArrowLeft, ShieldAlert } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Runehall UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fatal-error">
        <div className="fatal-error-card card">
          <div className="fatal-error-icon">
            <ShieldAlert size={26} />
          </div>
          <div className="page-eyebrow">The page hit a snag</div>
          <h1>Runehall lost its place.</h1>
          <p>
            Your campaign data is still safe in the local database. Reload the page to try again; if
            the problem keeps happening, export a backup before making further changes.
          </p>
          {this.state.message ? (
            <pre className="fatal-error-detail">{this.state.message}</pre>
          ) : null}
          <div className="row wrap">
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} /> Reload the page
            </button>
            <a className="btn btn-secondary btn-md" href="/campaigns">
              <ArrowLeft size={15} /> My Campaigns
            </a>
          </div>
        </div>
      </div>
    );
  }
}
