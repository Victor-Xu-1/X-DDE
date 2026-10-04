import { useState } from "react";
import { DeploymentPanel } from "../deployment/DeploymentPanel";
import { RuntimeStatus } from "./RuntimeStatus";
import { WorkspaceTabs } from "./WorkspaceTabs";
import type { Deployment } from "../deployment/client";
import type { Health, Language } from "../types";
export function EnvironmentWorkspace({
  language,
  data,
  error,
  refresh,
  health,
  connectionError,
  onReconnect,
}: {
  language: Language;
  data: Deployment | null;
  error: string;
  refresh(): void;
  health: Health | null;
  connectionError: boolean;
  onReconnect(): void;
}) {
  const [tab, setTab] = useState("components"),
    zh = language === "zh";
  return (
    <WorkspaceTabs
      label={zh ? "安装与运行" : "Installation and runtime"}
      value={tab}
      onChange={setTab}
      tabs={[
        { id: "components", label: zh ? "组件安装" : "Components" },
        { id: "runtime", label: zh ? "运行状态" : "Runtime" },
      ]}
    >
      <div hidden={tab !== "components"}>
        <DeploymentPanel
          data={data}
          error={error}
          refresh={refresh}
          language={language}
        />
      </div>
      {tab === "runtime" && (
        <RuntimeStatus
          language={language}
          health={health}
          connectionError={connectionError}
          onRefresh={onReconnect}
          onSetup={() => setTab("components")}
        />
      )}
    </WorkspaceTabs>
  );
}
