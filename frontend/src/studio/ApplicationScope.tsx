import { createContext, useContext, type ReactNode } from "react";
import IconContext from "@ant-design/icons/es/components/Context";
import type { useDeployment } from "../deployment/client";
import { ComputePowerProvider } from "../utilities/ComputeSwitch";
import { PrimaryBackendScope } from "../utilities/backend-control-scope";

// The application supplies its existing live worker state; viewers do not poll
// health independently or create a separate execution authority.
export const TaskServiceContext = createContext(true);
export const useTaskServiceAvailability = () => useContext(TaskServiceContext);

export function ApplicationScope({
  taskServiceAvailable,
  deployment,
  primaryBackendCapability,
  children,
}: {
  taskServiceAvailable: boolean;
  deployment: ReturnType<typeof useDeployment>;
  primaryBackendCapability: string | null;
  children: ReactNode;
}) {
  return (
    <IconContext.Provider value={{ zeroRuntime: true }}>
      <TaskServiceContext.Provider value={taskServiceAvailable}>
        <ComputePowerProvider {...deployment}>
          <PrimaryBackendScope.Provider
            value={
              primaryBackendCapability
                ? { capability: primaryBackendCapability }
                : null
            }
          >
            {children}
          </PrimaryBackendScope.Provider>
        </ComputePowerProvider>
      </TaskServiceContext.Provider>
    </IconContext.Provider>
  );
}
