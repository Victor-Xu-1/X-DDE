import { createContext, useContext, useState, type ReactNode } from "react";
import { posePlan, type PoseFrame } from "./pose-plan";
import { usePoseOptimization } from "./usePoseOptimization";
import { TemplatePreviewContext } from "../examples/context";

export type PoseController = ReturnType<typeof usePoseOptimization>;
interface Workspace {
  plan: ReturnType<typeof posePlan>;
  controller: PoseController;
  inputMode: "displayed" | "original";
  chooseInput(mode: "displayed" | "original"): void;
  view: string | undefined;
  chooseView(id: string): void;
}
const PoseContext = createContext<Workspace | null>(null);
export const usePoseSession = () => useContext(PoseContext);

/** The single existing pose controller stays mounted during tabs and handoffs. */
export function PoseSession({
  frame,
  children,
}: {
  frame: PoseFrame;
  children: ReactNode;
}) {
  const preview = useContext(TemplatePreviewContext);
  const plan = posePlan({
    ...frame,
    sourceSnapshot: frame.sourceSnapshot || preview,
  });
  const existing = usePoseSession();
  if (existing?.plan.key === plan.key) return <>{children}</>;
  return <OwnedPoseSession plan={plan}>{children}</OwnedPoseSession>;
}
function OwnedPoseSession({
  plan,
  children,
}: {
  plan: Workspace["plan"];
  children: ReactNode;
}) {
  const controller = usePoseOptimization(plan.base, plan.index);
  const [choice, setChoice] = useState({
    key: plan.key,
    mode: "displayed" as "displayed" | "original",
  });
  const inputMode = choice.key === plan.key ? choice.mode : "displayed";
  const [view, setView] = useState<{ key: string; id: string } | null>(null);
  return (
    <PoseContext.Provider
      value={{
        plan,
        controller,
        inputMode,
        chooseInput: (mode) => setChoice({ key: plan.key, mode }),
        view: view?.key === plan.key ? view.id : undefined,
        chooseView: (id) => setView({ key: plan.key, id }),
      }}
    >
      {children}
    </PoseContext.Provider>
  );
}
