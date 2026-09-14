import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || "The interface hit an unexpected error." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-void px-6 text-parchment">
          <div className="max-w-md text-center">
            <p className="font-display text-3xl italic">Something splintered.</p>
            <p className="mt-3 text-sm text-muted">{this.state.message}</p>
            <button
              type="button"
              className="mt-6 rounded-full border border-ember/40 px-5 py-2 text-sm text-ember"
              onClick={() => this.setState({ message: null })}
            >
              Try to recover
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
