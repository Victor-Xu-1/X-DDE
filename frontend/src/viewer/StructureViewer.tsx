import {
  StructureViewport,
  type StructureViewerProps,
} from "./StructureViewport";
import { posePlan } from "./pose-plan";
import { usePoseSession } from "./PoseSession";
import { usePoseOptimization } from "./usePoseOptimization";
import { useContext } from "react";
import { TemplatePreviewContext } from "../examples/context";

export function StructureViewer(props: StructureViewerProps) {
  const preview = useContext(TemplatePreviewContext);
  const scoped = preview ? { ...props, sourceSnapshot: true } : props;
  const workspace = usePoseSession();
  const plan = posePlan(scoped);
  if (!scoped.sourceSnapshot && workspace?.plan.key === plan.key)
    return (
      <StructureViewport {...scoped} optimization={workspace.controller} />
    );
  return <StandaloneViewer props={scoped} plan={plan} />;
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
