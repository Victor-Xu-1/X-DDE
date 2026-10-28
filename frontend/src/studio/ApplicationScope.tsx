import { createContext, useContext, type ReactNode } from "react";
import IconContext from "@ant-design/icons/es/components/Context";

// The application supplies its existing live worker state; viewers do not poll
// health independently or create a separate execution authority.
export const TaskServiceContext = createContext(true);
export const useTaskServiceAvailability = () => useContext(TaskServiceContext);

export function ApplicationScope({
  taskServiceAvailable,
  children,
}: {
  taskServiceAvailable: boolean;
  children: ReactNode;
}) {
  return (
    <IconContext.Provider value={{ zeroRuntime: true }}>
      <TaskServiceContext.Provider value={taskServiceAvailable}>
        {children}
      </TaskServiceContext.Provider>
    </IconContext.Provider>
  );
}
