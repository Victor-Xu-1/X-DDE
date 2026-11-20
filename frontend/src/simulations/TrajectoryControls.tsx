import {
  DownloadOutlined,
  PauseOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { DynamicsResult } from "./types";

export function TrajectoryControls({
  jobId,
  language,
  replicas,
  repeat,
  frame,
  playing,
  onRepeat,
  onFrame,
  onToggle,
}: {
  jobId: string;
  language: Language;
  replicas: DynamicsResult["replicas"];
  repeat: number;
  frame: number;
  playing: boolean;
  onRepeat(index: number): void;
  onFrame(index: number): void;
  onToggle(): void;
}) {
  const zh = language === "zh";
  const current = replicas[repeat];
  const snapshot = current.frames[frame];
  const time = `${snapshot.time_ns.toPrecision(4)} ns`;
  const position = `${zh ? "采样帧" : "Sampled frame"} ${frame + 1} / ${current.frames.length}`;
  const playLabel = playing
    ? zh
      ? "暂停轨迹"
      : "Pause trajectory"
    : zh
      ? "播放轨迹"
      : "Play trajectory";
  return (
    <div className="trajectory-strip">
      <header className="trajectory-heading">
        <h2>{zh ? "三维轨迹" : "3D trajectory"}</h2>
        {replicas.length > 1 && (
          <label>
            {zh ? "独立重复" : "Independent repeat"}
            <select
              value={repeat}
              onChange={(event) => onRepeat(Number(event.target.value))}
            >
              {replicas.map((replica, index) => (
                <option key={replica.repeat} value={index}>
                  {zh ? "重复" : "Repeat"} {replica.repeat}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      <div className="trajectory-controls">
        <button
          type="button"
          className="secondary-button trajectory-play"
          aria-label={playLabel}
          title={playLabel}
          disabled={current.frames.length < 2}
          onClick={onToggle}
        >
          {playing ? <PauseOutlined /> : <PlayCircleOutlined />}
        </button>
        <input
          aria-label={zh ? "轨迹时间" : "Trajectory time"}
          aria-valuetext={`${time}, ${position}`}
          type="range"
          min={0}
          max={current.frames.length - 1}
          value={frame}
          disabled={current.frames.length < 2}
          onChange={(event) => onFrame(Number(event.target.value))}
        />
        <output title={position}>
          <strong>{time}</strong>
          <span>
            {frame + 1} / {current.frames.length}
          </span>
        </output>
        <a
          className="secondary-button"
          href={artifactUrl(jobId, snapshot.artifact)}
          download
          aria-label={zh ? "下载当前结构" : "Download frame"}
          title={zh ? "下载当前结构" : "Download frame"}
        >
          <DownloadOutlined aria-hidden="true" />
          <span className="trajectory-download-label">
            {zh ? "下载当前结构" : "Download frame"}
          </span>
        </a>
      </div>
    </div>
  );
}
