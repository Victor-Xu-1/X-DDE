import {
  StructureViewport,
  type StructureViewerProps,
} from "./StructureViewport";
import { posePlan } from "./pose-plan";
import { usePoseSession } from "./PoseSession";
import { usePoseOptimization } from "./usePoseOptimization";

export function StructureViewer(props: StructureViewerProps) {
  const workspace = usePoseSession();
  const plan = posePlan(props);
  if (workspace?.plan.key === plan.key)
    return <StructureViewport {...props} optimization={workspace.controller} />;
  return <StandaloneViewer props={props} plan={plan} />;
}
function StandaloneViewer({
  props,
  plan,
}: {
  props: StructureViewerProps;
  plan: ReturnType<typeof posePlan>;
}) {
  const controller = usePoseOptimization(plan.base, plan.index);
  return <StructureViewport {...props} optimization={controller} />;
}
