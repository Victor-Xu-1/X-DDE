import type { Deployment } from "./client";
import type { ComponentPackage } from "./component-groups";

export function packageOf(
  id: string,
  values: Partial<ComponentPackage> = {},
): ComponentPackage {
  return {
    id,
    name: id,
    engine: null,
    kind: "runtime",
    version: "1",
    description: "中文 / English",
    size: "1 GB",
    automatic: false,
    license: "MIT",
    ...values,
  };
}
export function deploymentFixture(
  packages: ComponentPackage[],
  values: Partial<Deployment> = {},
): Deployment {
  return {
    config: {},
    installed: {},
    default_location: "/home/test/components",
    locations: [],
    operations: [],
    restart_required: false,
    prerequisites: { docker: true, uv: true, gpu_tool: false, supported: true },
    packages,
    engines: {},
    ...values,
  };
}
