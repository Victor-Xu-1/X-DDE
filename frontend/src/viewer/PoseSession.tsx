import { createContext, useContext, type ReactNode } from "react";
import { posePlan, type PoseFrame } from "./pose-plan";
import { usePoseOptimization } from "./usePoseOptimization";

export type PoseController = ReturnType<typeof usePoseOptimization>;
interface Workspace {
  plan: ReturnType<typeof posePlan>;
  controller: PoseController;
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
  const plan = posePlan(frame);
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
  return (
    <PoseContext.Provider value={{ plan, controller }}>
      {children}
    </PoseContext.Provider>
  );
}
