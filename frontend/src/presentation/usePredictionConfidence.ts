import { useCallback, useState } from "react";
import {
  confidenceIdentity,
  type ConfidenceBinding,
  type ConfidenceInspection,
} from "../viewer/confidence-types";

/** One source identity owns matrix, sequence, atom selection and confidence colors. */
export function usePredictionConfidence(
  job: string,
  candidate: string,
  enabled: boolean,
) {
  const key = `${job}:${candidate}`;
  const [annotation, setAnnotation] = useState<{
    key: string;
    value: ConfidenceBinding | null;
  }>();
  const [inspection, setInspection] = useState<{
    key: string;
    value: ConfidenceInspection | null;
  }>();
  const [residues, setResidues] = useState<{ key: string; value: string[] }>();
  const [requested, setRequested] = useState<{
    key: string;
    tokens: number[];
    nonce: number;
  } | null>(null);
  const [selected, setSelected] = useState<{
    key: string;
    tokens: number[];
  } | null>(null);
  const binding = enabled && annotation?.key === key ? annotation.value : null;
  const mapped =
    binding &&
    inspection?.key === key &&
    inspection.value?.key === confidenceIdentity(binding)
      ? inspection.value
      : null;
  const onBinding = useCallback(
    (value: ConfidenceBinding | null) => setAnnotation({ key, value }),
    [key],
  );
  return {
    viewer: {
      confidence: binding,
      onConfidenceInspection: (value: ConfidenceInspection | null) =>
        setInspection({ key, value }),
      confidenceSelection: mapped?.key === requested?.key ? requested : null,
      onConfidenceSelected: setSelected,
      onResiduesSelected: (value: string[]) => setResidues({ key, value }),
    },
    panel: {
      onBinding,
      inspection: mapped,
      selectedResidues: residues?.key === key ? residues.value : [],
      selectedTokens: selected?.key === mapped?.key ? selected?.tokens : [],
      onTokens: (tokens: number[]) => {
        if (mapped)
          setRequested((previous) => ({
            key: mapped.key,
            tokens,
            nonce: (previous?.nonce ?? 0) + 1,
          }));
      },
    },
  };
}
