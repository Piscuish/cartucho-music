import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** Evita que un fallo en una pantalla tumbe la app entera. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui]", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-red-500/10 text-red-400"><TriangleAlert className="size-6" /></div>
        <h2 className="font-display text-[19px] font-semibold">Esta pantalla ha fallado</h2>
        <p className="mt-2 max-w-md text-[13px] text-muted">El resto de Cartucho Music sigue funcionando.</p>
        <button onClick={() => this.setState({ error: null })} className="mt-5 rounded-full bg-accent px-5 py-2 text-[13px] font-semibold text-on-accent">
          Reintentar
        </button>
      </div>
    );
  }
}
