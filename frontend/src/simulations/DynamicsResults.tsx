import { useEffect, useRef, useState } from "react";
import { artifactUrl } from "../api";
import { MolecularViewport } from "./MolecularViewport";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Job, Language } from "../types";
import { SimulationPlot } from "./SimulationPlot";
import { SimulationFiles } from "./SimulationFiles";
import type { DynamicsResult, Residue } from "./types";
import { sampledSelection } from "./sample-selection";
import "./simulations.css";

const colors = ["#5865d8", "#18998b", "#b773ab"];
export function DynamicsResults({
  job,
  result,
  language,
  files,
}: {
  job: Job;
  result: DynamicsResult;
  language: Language;
  files: Record<string, string>;
}) {
  const zh = language === "zh",
    [repeat, setRepeat] = useState(0),
    [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false);
  const [focusResidue, setFocusResidue] = useState<Residue | null>(null);
  const current = result.replicas[repeat] ?? result.replicas[0],
    snapshot = current.frames[frame] ?? current.frames[0];
  const hasLigand = current.frames.some((f) => f.ligand_rmsd_angstrom !== null);
  const frameReady = useRef(false);
  useEffect(() => {
    frameReady.current = false;
  }, [snapshot.artifact]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (frameReady.current) {
        frameReady.current = false;
        setFrame((i) => (i + 1) % current.frames.length);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [playing, current.frames.length]);
  const label = (n: number) => `${zh ? "重复" : "Repeat"} ${n}`;
  const stability = result.replicas.map((r, i) => ({
    label: label(r.repeat),
    color: colors[i],
    points: r.frames.map((f) => ({
      x: f.time_ns,
      y: f.backbone_rmsd_angstrom,
    })),
  }));
  const chooseTime = (time: number, seriesIndex: number) => {
    const selection = sampledSelection(result.replicas, time, seriesIndex);
    if (!selection) return;
    setPlaying(false);
    setRepeat(selection.repeat);
    setFrame(selection.frame);
    setFocusResidue(null);
  };
  return (
    <div className="simulation-results" data-testid="dynamics-results">
      <div className="simulation-result-toolbar">
        <h2>{zh ? "分子动力学" : "Molecular dynamics"}</h2>
        <label>
          {zh ? "独立重复" : "Independent repeat"}
          <select
            value={repeat}
            onChange={(e) => {
              setRepeat(Number(e.target.value));
              setFrame(0);
              setPlaying(false);
              setFocusResidue(null);
            }}
          >
            {result.replicas.map((r, i) => (
              <option key={r.repeat} value={i}>
                {label(r.repeat)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="simulation-main-grid">
        <section className="simulation-trajectory">
          <h3>{zh ? "三维轨迹" : "3D trajectory"}</h3>
          <MolecularViewport
            onExport={() => setPlaying(false)}
            onReady={() => {
              frameReady.current = true;
            }}
            frames={current.frames.map((f) => artifactUrl(job.id, f.artifact))}
            frame={frame}
            ligandContext={hasLigand}
            focusResidue={focusResidue}
            language={language}
          />
          <div className="trajectory-controls">
            <button
              type="button"
              className="secondary-button"
              aria-label={
                playing
                  ? zh
                    ? "暂停轨迹"
                    : "Pause trajectory"
                  : zh
                    ? "播放轨迹"
                    : "Play trajectory"
              }
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <input
              aria-label={zh ? "轨迹时间" : "Trajectory time"}
              type="range"
              min={0}
              max={current.frames.length - 1}
              value={frame}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
            />
            <output>{snapshot.time_ns.toPrecision(4)} ns</output>
            <a href={artifactUrl(job.id, snapshot.artifact)} download>
              {zh ? "下载当前结构" : "Download frame"} ↓
            </a>
          </div>
          <p className="field-help">
            {zh ? "采样帧" : "Sampled frame"} {frame + 1} /{" "}
            {current.frames.length} ·{" "}
            {zh
              ? "原始轨迹可完整下载"
              : "Full native trajectory available for download"}
          </p>
          <dl className="simulation-readouts">
            <div>
              <dt>{zh ? "骨架 RMSD" : "Backbone RMSD"}</dt>
              <dd>{snapshot.backbone_rmsd_angstrom.toFixed(2)} Å</dd>
            </div>
            {hasLigand && (
              <div>
                <dt>{zh ? "配体 RMSD" : "Ligand RMSD"}</dt>
                <dd>{snapshot.ligand_rmsd_angstrom?.toFixed(2)} Å</dd>
              </div>
            )}
            <div>
              <dt>{zh ? "回转半径" : "Radius of gyration"}</dt>
              <dd>{snapshot.radius_gyration_angstrom.toFixed(2)} Å</dd>
            </div>
          </dl>
        </section>
        <div className="simulation-time-plots">
          <SimulationPlot
            title={zh ? "骨架稳定性" : "Backbone stability"}
            xLabel="Time (ns)"
            yLabel="RMSD (Å)"
            series={stability}
            selectedX={snapshot.time_ns}
            onSelect={chooseTime}
            language={language}
          />
          <ResearchTabs
            label={zh ? "稳定性曲线" : "Stability curves"}
            tabs={[
              {
                id: "ligand",
                label: zh ? "配体稳定性" : "Ligand stability",
                content: (
                  <SimulationPlot
                    title={zh ? "结合姿势稳定性" : "Bound-pose stability"}
                    xLabel="Time (ns)"
                    yLabel="Ligand RMSD (Å)"
                    series={result.replicas.map((r, i) => ({
                      label: label(r.repeat),
                      color: colors[i],
                      points: r.frames
                        .filter((f) => f.ligand_rmsd_angstrom != null)
                        .map((f) => ({
                          x: f.time_ns,
                          y: f.ligand_rmsd_angstrom!,
                        })),
                    }))}
                    selectedX={snapshot.time_ns}
                    onSelect={chooseTime}
                    language={language}
                  />
                ),
              },
              {
                id: "radius",
                label: "Rg",
                content: (
                  <SimulationPlot
                    title={zh ? "结构紧致度" : "Structural compactness"}
                    xLabel="Time (ns)"
                    yLabel="Rg (Å)"
                    series={result.replicas.map((r, i) => ({
                      label: label(r.repeat),
                      color: colors[i],
                      points: r.frames.map((f) => ({
                        x: f.time_ns,
                        y: f.radius_gyration_angstrom,
                      })),
                    }))}
                    selectedX={snapshot.time_ns}
                    onSelect={chooseTime}
                    language={language}
                  />
                ),
              },
              {
                id: "energy",
                label: zh ? "势能" : "Potential energy",
                content: (
                  <SimulationPlot
                    title={zh ? "体系势能" : "System potential energy"}
                    xLabel="Time (ns)"
                    yLabel="Energy (kJ/mol)"
                    series={result.replicas.map((r, i) => ({
                      label: label(r.repeat),
                      color: colors[i],
                      points: r.frames.map((f) => ({
                        x: f.time_ns,
                        y: f.potential_kj_mol,
                      })),
                    }))}
                    selectedX={snapshot.time_ns}
                    onSelect={chooseTime}
                    language={language}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
      <div
        className={
          hasLigand
            ? "simulation-secondary-grid"
            : "simulation-secondary-grid is-single"
        }
      >
        <SimulationPlot
          title={zh ? "残基波动" : "Residue fluctuations"}
          xLabel={zh ? "残基序列位置" : "Residue sequence position"}
          yLabel="RMSF (Å)"
          series={result.replicas.map((r, i) => ({
            label: label(r.repeat),
            color: colors[i],
            points: r.residues.map((res, index) => ({
              x: index + 1,
              y: res.rmsf_angstrom,
              label: `${res.chain}:${res.name}${res.number}${res.insertion}`,
            })),
          }))}
          language={language}
          onSelect={(position, seriesIndex) => {
            chooseTime(snapshot.time_ns, seriesIndex);
            setFocusResidue(
              result.replicas[seriesIndex]?.residues[
                Math.round(position) - 1
              ] ?? null,
            );
          }}
        />
        {hasLigand && (
          <ResearchTable
            rows={current.contacts}
            language={language}
            title={zh ? "结合接触占有率" : "Binding-contact occupancy"}
            onSelect={(row) => setFocusResidue(row)}
            rowId={(r) => `${r.chain}:${r.number}:${r.insertion}`}
            exportName="contact-occupancy.csv"
            columns={[
              {
                key: "residue",
                label: zh ? "氨基酸" : "Residue",
                value: (r) => `${r.chain}:${r.name}${r.number}${r.insertion}`,
              },
              {
                key: "occupancy",
                label: zh ? "接触占有率" : "Occupancy",
                numeric: true,
                value: (r) => r.occupancy,
                render: (r) => (
                  <span className="simulation-occupancy">
                    <meter min={0} max={1} value={r.occupancy} />
                    {(r.occupancy * 100).toFixed(1)}%
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
      <details className="simulation-method">
        <summary>
          {zh
            ? "模拟条件与结果说明"
            : "Simulation conditions and interpretation"}
        </summary>
        <p>{result.method}</p>
        <p>
          {zh
            ? "RMSD 相对首个生产采样结构；曲线显示采样行为，不证明实验稳定性或收敛。接触占有率按 4 Å 重原子距离计算，不是相互作用力。"
            : "RMSD uses the first production snapshot. Sampling does not establish experimental stability or convergence. Contact occupancy uses a 4 Å heavy-atom cutoff, not interaction strength."}
        </p>
        <ResearchTable
          rows={current.residues}
          language={language}
          title="RMSF"
          rowId={(r) => `${r.chain}:${r.number}:${r.insertion}`}
          exportName="residue-rmsf.csv"
          columns={[
            {
              key: "residue",
              label: zh ? "残基" : "Residue",
              value: (r) => `${r.chain}:${r.name}${r.number}${r.insertion}`,
            },
            {
              key: "rmsf",
              label: "RMSF (Å)",
              numeric: true,
              value: (r) => r.rmsf_angstrom,
            },
          ]}
        />
      </details>
      <SimulationFiles job={job} files={files} language={language} />
    </div>
  );
}
