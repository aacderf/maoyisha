import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { prepareMobilePlatform } from "./lib/platform.js";
import "./styles.css";

prepareMobilePlatform();

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("茂一杀运行错误", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="surface error-panel">
            <p className="eyebrow">运行错误</p>
            <h1>界面加载失败</h1>
            <p>{this.state.error.message || "未知错误。"}</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
