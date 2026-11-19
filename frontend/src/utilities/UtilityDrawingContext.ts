import { createContext } from "react";
import type { EditorDrawing } from "./useRecognitionDrawing";

export type UtilityDrawingOffer = EditorDrawing & { dismiss(id: string): void };
export const UtilityDrawingContext = createContext<UtilityDrawingOffer | null>(
  null,
);
