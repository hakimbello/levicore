import { Component, Suspense, type ReactNode } from "react";

type LazySurfaceProps = {
  label: string;
  children: ReactNode;
};

type LazySurfaceState = {
  error: Error | null;
};

class LazySurfaceErrorBoundary extends Component<LazySurfaceProps, LazySurfaceState> {
  state: LazySurfaceState = { error: null };

  static getDerivedStateFromError(error: Error): LazySurfaceState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="levi-lazy-error" role="alert">
          <strong>{this.props.label} failed to load.</strong>
          <p>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LazySurface({ label, children }: LazySurfaceProps) {
  return (
    <LazySurfaceErrorBoundary label={label}>
      <Suspense
        fallback={
          <div className="levi-lazy-loading" aria-live="polite" aria-busy="true">
            {label} loading…
          </div>
        }
      >
        {children}
      </Suspense>
    </LazySurfaceErrorBoundary>
  );
}
