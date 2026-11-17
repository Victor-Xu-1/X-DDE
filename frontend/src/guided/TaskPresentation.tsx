import { createContext, type ReactNode } from "react";
import type { Job } from "../types";

/** A view preference only; native forms still own inputs and submission. */
export const TaskPresentationContext = createContext<{
  layout: "single";
  renderResult(job: Job): ReactNode;
} | null>(null);
