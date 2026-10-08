import "../presentation/ensemble-results.css";
import { useState } from "react";
import { ClusterForm } from "./ClusterForm";
import { ClusterExample } from "./ClusterExample";
import { PoseScoreComparison } from "./PoseScoreComparison";
import { PoseOutcomeList } from "./PoseOutcomeList";
import { PoseDetail } from "./PoseDetail";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "../docking/DockingForm";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { PoseSet } from "./types";
import "./poses.css";

export function PoseResults({
  value,
  language,
  fixedExample = false,
}: {
  value: PoseSet;
  language: Language;
  fixedExample?: boolean;
}) {
  return (
    <PoseResultWorkspace
      key={value.id}
      value={value}
      language={language}
      fixedExample={fixedExample}
    />
  );
}

function PoseResultWorkspace({
  value,
  language,
  fixedExample,
}: {
  value: PoseSet;
  language: Language;
  fixedExample: boolean;
}) {
  const zh = language === "zh";
  const initialIndex = Math.max(
    0,
    value.outcomes.findIndex((outcome) =>
      outcome.poses.some((pose) => pose.reference),
    ),
  );
  const [index, setIndex] = useState(initialIndex),
    [pose, setPose] = useState<number | null>(
      value.outcomes[initialIndex]?.poses.find((pose) => pose.reference)
        ?.evidence.record ?? null,
    ),
    [next, setNext] = useState<"properties" | "score" | null>(null),
    [message, setMessage] = useState(""),
    [clustering, setClustering] = useState(false),
    [exampleOpen, setExampleOpen] = useState(false);
  const outcome = value.outcomes[index];
  const selected = outcome?.poses.find(
    (p) => p.evidence.record === pose && p.reference,
  );
  function chooseOutcome(target: number) {
    setIndex(target);
    setPose(
      value.outcomes[target]?.poses.find((row) => row.reference)?.evidence
        .record ?? null,
    );
    setNext(null);
  }
  if (clustering || exampleOpen)
    return (
      <section className="pose-results">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setClustering(false);
            setExampleOpen(false);
          }}
        >
          {zh ? "← 返回姿势结果" : "← Back to pose results"}
        </button>
        {clustering ? (
          <ClusterForm key={value.id} value={value} language={language} />
        ) : (
          <ClusterExample language={language} />
        )}
      </section>
    );
  if (next && selected?.reference && outcome)
    return (
      <ResearchHandoff language={language} onBack={() => setNext(null)}>
        {next === "properties" ? (
          <PropertyForm
            language={language}
            initialFile={selected.reference.asset_id}
            scientificInput={selected.reference}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        ) : (
          <DockingForm
            language={language}
            mode="score"
            initialReceptor={outcome.combination.receptor}
            initialLigand={selected.reference}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        )}
        {message && <p role="status">{message}</p>}
      </ResearchHandoff>
    );
  return (
    <section
      className="pose-results"
      aria-label={zh ? "多假设姿势集合" : "Multi-hypothesis pose ensemble"}
    >
      <header className="ensemble-result-heading">
        <h3>
          {zh ? "可用姿势" : "Available poses"}{" "}
          <span className="ensemble-count">{value.qualified_pose_count}</span>
        </h3>
        <span className="field-help">
          {value.collection_status === "complete"
            ? zh
              ? "各组合均已执行"
              : "All combinations executed"
            : zh
              ? "部分组合结果"
              : "Partial combination results"}
        </span>
        <Hint label={zh ? "姿势与分数说明" : "Pose and score help"}>
          {zh
            ? "保留成功、失败、取消及未尝试的组合。原生姿势与分数不是实验结合确证；不同受体、状态或方法的分数不能直接混排。"
            : "Successful, failed, cancelled and unattempted combinations are retained. Native poses and scores are not experimental binding proof; compare scores only within matched receptors, states and methods."}
        </Hint>
      </header>
      {!outcome ? (
        <p role="status">
          {zh
            ? "尚未收集到组合结果。"
            : "No combination results have been collected."}
        </p>
      ) : (
        <>
          <div className="ensemble-result-layout">
            <PoseOutcomeList
              value={value}
              index={index}
              pose={pose}
              language={language}
              onOutcome={chooseOutcome}
              onPose={(record) => {
                setPose(record);
                setNext(null);
              }}
            />
            <PoseDetail
              outcome={outcome}
              record={pose}
              language={language}
              onNext={setNext}
            />
          </div>
          <div className="editor-toolbar">
            <button
              className="secondary-button"
              type="button"
              disabled={value.qualified_pose_count < 2}
              onClick={() => setClustering(true)}
            >
              {zh ? "按结合模式分群" : "Cluster binding modes"}
            </button>
            {fixedExample && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setExampleOpen(true)}
              >
                {zh
                  ? "查看结合模式分群示例"
                  : "View the binding-mode clustering example"}
              </button>
            )}
          </div>
          <PoseScoreComparison
            value={value}
            outcomeIndex={index}
            language={language}
            onSelect={(stepId, record) => {
              const target = value.outcomes.findIndex(
                (row) => row.combination.step_id === stepId,
              );
              if (target >= 0) {
                setIndex(target);
                setPose(record);
                setNext(null);
              }
            }}
          />
        </>
      )}
    </section>
  );
}
