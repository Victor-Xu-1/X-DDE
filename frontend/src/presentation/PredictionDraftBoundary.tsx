import { useState, type ReactNode } from "react";

/** Explicit resume creates a fresh editor lifetime; no saved form auto-opens. */
export function PredictionDraftBoundary<Draft>({
  children,
}: {
  children(value: {
    initialDraft: Draft | null;
    edition: number;
    onResume(value: Draft): void;
  }): ReactNode;
}) {
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [edition, setEdition] = useState(0);
  return children({
    initialDraft,
    edition,
    onResume(value) {
      setInitialDraft(value);
      setEdition((current) => current + 1);
    },
  });
}
