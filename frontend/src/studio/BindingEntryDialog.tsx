import { useEffect, useId, useRef, useState } from "react";
import { ChoiceCards } from "../guided/ChoiceCards";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import {
  bindingEntryTool,
  bindingPaths,
  type BindingKnowledge,
  type StructureMaterial,
} from "./binding-entry";
import "./binding-entry.css";
export function BindingEntryDialog({
  language,
  onClose,
  onSelect,
}: {
  language: Language;
  onClose(): void;
  onSelect(tool: ToolId): void;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1,
    id = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<BindingKnowledge | "">("");
  const [material, setMaterial] = useState<StructureMaterial | "">("");
  const [step, setStep] = useState<0 | 1>(0);
  useEffect(() => {
    dialog.current?.showModal();
    heading.current?.focus();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function next() {
    if (!mode) return;
    if (mode === "insufficient" && step === 0) {
      setStep(1);
      return;
    }
    const tool = bindingEntryTool(mode, material || undefined);
    if (!tool) return;
    onClose();
    onSelect(tool);
  }
  return (
    <dialog
      ref={dialog}
      className="project-create-dialog binding-entry-dialog"
      aria-labelledby={id}
      onCancel={onClose}
    >
      <header>
        <h2 ref={heading} id={id} tabIndex={-1}>
          {step === 0
            ? zh
              ? "您现在有哪些材料？"
              : "What evidence do you have?"
            : zh
              ? "目前可以提供什么？"
              : "What can you provide now?"}
        </h2>
        <button
          type="button"
          className="text-button"
          aria-label={zh ? "关闭" : "Close"}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        {step === 0 ? (
          <ChoiceCards<BindingKnowledge | "">
            label={zh ? "已有材料" : "Available evidence"}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setMaterial("");
            }}
            options={bindingPaths.map((path) => ({
              value: path.value,
              title: path.title[index],
              note: path.note[index],
            }))}
          />
        ) : (
          <ChoiceCards<StructureMaterial | "">
            label={zh ? "结构前置材料" : "Structure prerequisite"}
            value={material}
            onChange={setMaterial}
            options={[
              {
                value: "sequence",
                title: zh ? "只有蛋白序列" : "Protein sequence only",
                note: zh
                  ? "先预测结构；查看置信度后再考虑口袋。"
                  : "Predict a structure and inspect confidence before considering pockets.",
              },
              {
                value: "structure",
                title: zh
                  ? "已有需要检查的结构"
                  : "An existing structure to inspect",
                note: zh
                  ? "先检查缺失区、水、离子和链，再选择后续任务。"
                  : "Inspect gaps, water, ions and chains before choosing the next task.",
              },
            ]}
          />
        )}
        <footer className="questionnaire-actions">
          {step === 1 ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep(0)}
            >
              {zh ? "上一步" : "Back"}
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              {zh ? "取消" : "Cancel"}
            </button>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={step === 0 ? !mode : !material}
          >
            {zh ? "下一步" : "Next"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
