import { Fragment, type ReactNode } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { models } from "./generated";
import { referenceKey } from "./model";
import { isDesign, type DiffMode, type Pocket } from "./types";
import { ReviewReference } from "./ReviewReference";

export function DiffReview({
  mode,
  language,
  taskLabel,
  name,
  protein,
  molecule,
  collection,
  pocket,
  options,
  fixed,
  chains,
  removeWater,
  keepLigands,
  removeH,
}: {
  mode: DiffMode;
  language: Language;
  taskLabel: string;
  name: string;
  protein: MoleculeRef | null;
  molecule: MoleculeRef | null;
  collection: MoleculeRef[];
  pocket: Pocket | null;
  options: Record<string, unknown>;
  fixed: number[];
  chains: string;
  removeWater: boolean;
  keepLigands: boolean;
  removeH: boolean;
}) {
  const zh = language === "zh",
    designing = isDesign(mode);
  const rows: [string, ReactNode][] = [[zh ? "任务" : "Task", taskLabel]];
  const material = (reference: MoleculeRef, kind: "structure" | "ligand") => (
    <ReviewReference reference={reference} kind={kind} language={language} />
  );
  if (
    protein &&
    (designing || ["pocket", "prepare", "interactions"].includes(mode))
  )
    rows.push([
      zh ? "受体文件" : "Receptor file",
      material(protein, "structure"),
    ]);
  if (
    molecule &&
    (mode === "interactions" || (designing && mode !== "generate"))
  )
    rows.push([
      zh ? "起始分子" : "Starting molecule",
      material(molecule, "ligand"),
    ]);
  if (mode === "properties" || mode === "export")
    rows.push([
      zh ? "分子集合" : "Molecular collection",
      <details>
        <summary>
          {collection.length} {zh ? "个选定记录" : "selected records"}
        </summary>
        <ol>
          {collection.map((reference) => (
            <li key={referenceKey(reference)}>
              {material(reference, "ligand")}
            </li>
          ))}
        </ol>
      </details>,
    ]);
  if (pocket && (designing || mode === "pocket")) {
    const scope =
      pocket.kind === "residues" ? (
        <details>
          <summary>
            {pocket.residues.length}{" "}
            {zh
              ? "个选定残基"
              : pocket.residues.length === 1
                ? "selected residue"
                : "selected residues"}
          </summary>
          <p>
            {pocket.residues
              .map((r) => `${r.chain}:${r.number}${r.insertion_code}`)
              .join(", ")}
          </p>
        </details>
      ) : pocket.kind === "bound_ligand" ? (
        `${zh ? "共晶配体" : "Bound ligand"} · ${pocket.residue.chain}:${pocket.residue.number}${pocket.residue.insertion_code}`
      ) : (
        material(pocket.ligand, "ligand")
      );
    rows.push([zh ? "口袋范围" : "Pocket scope", scope]);
  }
  if (designing) {
    const localSampling = mode === "diversify" || mode === "optimize";
    const steps = localSampling ? options.change_steps : options.steps;
    const model = models.find((value) => value.id === options.model);
    const modelLabel = model
      ? [
          model.representation === "fullatom"
            ? zh
              ? "全原子"
              : "Full atom"
            : "Cα",
          model.dataset,
          model.strategy === "cond"
            ? zh
              ? "条件生成"
              : "Conditional"
            : zh
              ? "联合生成"
              : "Joint",
        ].join(" · ")
      : String(options.model);
    rows.push([zh ? "生成模型" : "Generation model", modelLabel]);
    rows.push([
      mode === "optimize"
        ? zh
          ? "采样尝试预算"
          : "Sampling attempt budget"
        : zh
          ? "候选数量"
          : "Candidate count",
      String(
        mode === "optimize"
          ? Number(options.population) * Number(options.rounds)
          : options.count,
      ),
    ]);
    rows.push([
      zh ? "分子大小" : "Molecular size",
      localSampling
        ? zh
          ? "沿用起始分子的原子数量（后处理前）"
          : "Starting-molecule atom count before post-processing"
        : options.size_mode === "fixed"
          ? `${mode === "inpaint" ? fixed.length + Number(options.added_atoms) : options.atoms} ${zh ? "个重原子（后处理前）" : "heavy atoms before post-processing"}`
          : `${zh ? "按口袋采样" : "Sampled for the pocket"} · ${zh ? "最少" : "minimum"} ${Math.max(Number(options.minimum_atoms), mode === "inpaint" ? fixed.length : 0)} · ${zh ? "偏移" : "bias"} ${options.size_bias}`,
    ]);
    if (mode === "inpaint")
      rows.push([
        zh ? "固定核心" : "Fixed core",
        <details>
          <summary>
            {fixed.length} {zh ? "个固定重原子" : "fixed heavy atoms"}
          </summary>
          <p>
            {zh ? "原子编号" : "Atom numbers"}:{" "}
            {fixed.map((i) => i + 1).join(", ")}
          </p>
          <p>
            {options.preserve_bonds
              ? zh
                ? "保留核心内部键"
                : "Preserve internal core bonds"
              : zh
                ? "允许改变核心内部键"
                : "Allow internal core bond changes"}
          </p>
        </details>,
      ]);
    if (mode === "optimize")
      rows.push([
        zh ? "优化目标与预算" : "Optimization objective & budget",
        `${String(options.objective).toUpperCase()} · ${options.population} × ${options.rounds} ${zh ? "轮" : "rounds"} · ${options.survivors} ${zh ? "个后续亲本/轮" : "parents per round"}`,
      ]);
    rows.push([
      zh ? "采样详情" : "Sampling details",
      <details>
        <summary>
          {String(steps)} {zh ? "步" : "steps"} · {zh ? "种子" : "seed"}{" "}
          {String(options.seed)}
        </summary>
        {(mode === "inpaint" ||
          (mode === "generate" &&
            String(options.model).endsWith("_joint"))) && (
          <p>
            {zh ? "重采样次数" : "Resampling passes"}:{" "}
            {String(options.resamplings)}
          </p>
        )}
        {mode === "generate" && String(options.model).endsWith("_joint") && (
          <p>
            {zh ? "跳步长度" : "Jump length"}: {String(options.jump_length)}
          </p>
        )}
        <p>
          {zh ? "游离分子力场优化步数" : "Unbound force-field relaxation steps"}
          : {String(options.relaxation)}
        </p>
      </details>,
    ]);
  }
  if (mode === "prepare")
    rows.push(
      [
        zh ? "保留链" : "Retained chains",
        chains.trim() || (zh ? "全部" : "All"),
      ],
      [
        zh ? "结构处理" : "Structure preparation",
        [
          removeWater
            ? zh
              ? "移除水"
              : "Remove water"
            : zh
              ? "保留水"
              : "Keep water",
          keepLigands
            ? zh
              ? "保留配体"
              : "Keep ligands"
            : zh
              ? "移除配体"
              : "Remove ligands",
          removeH
            ? zh
              ? "移除氢"
              : "Remove hydrogens"
            : zh
              ? "保留原始氢"
              : "Retain source hydrogens",
        ].join(" · "),
      ],
    );
  rows.push([zh ? "任务名称" : "Task name", name.trim() || taskLabel]);
  return (
    <dl className="questionnaire-review">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
