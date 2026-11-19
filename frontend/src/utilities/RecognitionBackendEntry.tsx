import { BackendPowerSwitch } from "./BackendPowerSwitch";
import type { Language } from "../types";
import { recognitionOrigin } from "./image-molecule";
import {
  recognitionPhases,
  recognitionPowerBlocked,
  type useRecognitionStatus,
} from "./recognition-power";
import "./runtime-switch.css";

export function RecognitionBackendEntry({
  language,
  powerControl,
  onOpen,
}: {
  language: Language;
  powerControl: ReturnType<typeof useRecognitionStatus>;
  onOpen?(): void;
}) {
  const zh = language === "zh";
  const { status, changing, failed, toggle } = powerControl;
  const phase = status?.power?.phase;
  const description =
    phase && Object.hasOwn(recognitionPhases, phase)
      ? recognitionPhases[phase][zh ? 0 : 1]
      : status?.available === false
        ? zh
          ? "工作台未连接"
          : "Workbench offline"
        : zh
          ? "状态待确认"
          : "State unavailable";
  return (
    <div className="recognition-backend-entry">
      <BackendPowerSwitch
        id="decimer"
        name="DECIMER"
        status={changing ? (zh ? "正在切换…" : "Switching…") : description}
        enabled={status?.power?.enabled === true}
        disabled={!status?.idle_power || !phase}
        pending={changing || (phase != null && recognitionPowerBlocked(phase))}
        onToggle={() => void toggle()}
        setup={
          onOpen ? (
            <button type="button" className="text-button" onClick={onOpen}>
              {zh ? "打开识别工作台" : "Open image workbench"}
            </button>
          ) : status?.available === true && status.idle_power !== true ? (
            <a
              className="runtime-switch-setup"
              href={`${recognitionOrigin()}/?lang=${language}`}
              target="_blank"
              rel="noopener"
            >
              {zh
                ? "在新标签页管理识别服务"
                : "Manage recognition in a new tab"}
            </a>
          ) : undefined
        }
      />
      {failed && (
        <p className="backend-state-message" role="alert">
          {zh
            ? "未能确认启停结果，正在重新读取识别服务状态。"
            : "Could not confirm the power change. Checking recognition status."}
        </p>
      )}
    </div>
  );
}
