import { createContext, useContext } from "react";

/** An image replaces pending native selections in this input, never another input. */
export const ImageInputSourceContext = createContext<
  (() => AbortSignal) | null
>(null);
export const useImageInputSource = () => useContext(ImageInputSourceContext);
