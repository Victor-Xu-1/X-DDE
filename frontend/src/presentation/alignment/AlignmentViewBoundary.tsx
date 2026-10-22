import { Component, type ReactNode } from "react";
import type { Language } from "../../types";

/** A large scientific view must not take down its task or original downloads. */
export class AlignmentViewBoundary extends Component<
  { language: Language; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const zh = this.props.language === "zh";
    return (
      <div role="alert">
        <p>
          {zh
            ? "比对视图未能打开；原始比对文件仍可下载。"
            : "The alignment viewer could not open; the original alignment remains downloadable."}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          {zh ? "重新加载页面" : "Reload page"}
        </button>
      </div>
    );
  }
}
