import type { ReactNode } from "react";
import type { BoltzDraft } from "./boltz-draft";
import { PredictionDraftBoundary } from "../presentation/PredictionDraftBoundary";

/** Only explicit resume replaces this form; leaving Boltz discards this UI lifetime. */
export function BoltzDraftBoundary({
  children,
}: {
  children(value: {
    initialDraft: BoltzDraft | null;
    edition: number;
    onResume(value: BoltzDraft): void;
  }): ReactNode;
}) {
  return (
    <PredictionDraftBoundary<BoltzDraft>>{children}</PredictionDraftBoundary>
  );
}
