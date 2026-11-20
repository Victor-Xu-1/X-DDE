import { useEffect, useRef, useState } from "react";
import { artifactUrl } from "../api";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Job, Language } from "../types";
import { DynamicsAnalysis, ResidueFluctuationTable } from "./DynamicsAnalysis";
import { MolecularViewport } from "./MolecularViewport";
import { SimulationFiles } from "./SimulationFiles";
import { TrajectoryControls } from "./TrajectoryControls";
import { sampledSelection } from "./sample-selection";
import type { DynamicsResult, Residue } from "./types";
import "./simulations.css";
import "./result-workspace.css";

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
  const zh = language === "zh";
  const [repeat, setRepeat] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focusResidue, setFocusResidue] = useState<Residue | null>(null);
  const current = result.replicas[repeat];
  const snapshot = current.frames[frame];
  const hasLigand = current.frames.some(
    (entry) => entry.ligand_rmsd_angstrom !== null,
  );
  const frameReady = useRef(false);

  useEffect(() => {
    frameReady.current = false;
  }, [snapshot.artifact]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (!frameReady.current) return;
      frameReady.current = false;
      setFrame((index) => (index + 1) % current.frames.length);
    }, 1200);
    return () => clearInterval(timer);
  }, [playing, current.frames.length]);

  function chooseSample(replica: number, index: number) {
    setPlaying(false);
    setRepeat(replica);
    setFrame(index);
    setFocusResidue(null);
  }

  function chooseTime(time: number, series: number) {
    const selection = sampledSelection(result.replicas, time, series);
    if (selection) chooseSample(selection.repeat, selection.frame);
  }

  return (
    <div
      className="simulation-results simulation-result-workspace"
      data-testid="dynamics-results"
    >
      <StructureWorkbench
        preview={
          <section className="simulation-trajectory">
            <TrajectoryControls
              jobId={job.id}
              language={language}
              replicas={result.replicas}
              repeat={repeat}
              frame={frame}
              playing={playing}
              onRepeat={(replica) => chooseSample(replica, 0)}
              onFrame={(index) => {
                setPlaying(false);
                setFrame(index);
              }}
              onToggle={() => setPlaying((value) => !value)}
            />
            <MolecularViewport
              workspaceControls="focus"
              compactTools
              onExport={() => setPlaying(false)}
              onReady={(ready) => {
                frameReady.current = ready;
              }}
              frames={current.frames.map((entry) =>
                artifactUrl(job.id, entry.artifact),
              )}
              frame={frame}
              ligandContext={hasLigand}
              focusResidue={focusResidue}
              language={language}
            />
          </section>
        }
      >
        <div className="trajectory-analysis">
          <dl className="trajectory-readouts">
            <div>
              <dt>{zh ? "骨架 RMSD" : "Backbone RMSD"}</dt>
              <dd>{snapshot.backbone_rmsd_angstrom.toFixed(2)} Å</dd>
            </div>
            {snapshot.ligand_rmsd_angstrom !== null && (
              <div>
                <dt>{zh ? "配体 RMSD" : "Ligand RMSD"}</dt>
                <dd>{snapshot.ligand_rmsd_angstrom.toFixed(2)} Å</dd>
              </div>
            )}
            <div>
              <dt>{zh ? "回转半径" : "Radius of gyration"}</dt>
              <dd>{snapshot.radius_gyration_angstrom.toFixed(2)} Å</dd>
            </div>
          </dl>
          <SimulationFiles job={job} files={files} language={language} />
        </div>
        <div className="trajectory-analysis-tabs">
          <DynamicsAnalysis
            replicas={result.replicas}
            repeat={repeat}
            snapshot={snapshot}
            hasLigand={hasLigand}
            language={language}
            onTime={chooseTime}
            onResidue={(residue, series) => {
              if (series !== undefined) chooseTime(snapshot.time_ns, series);
              setFocusResidue(residue);
            }}
          />
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
              ? "RMSD 相对首个生产采样结构。接触占有率按 4 Å 重原子距离计算，表示采样中几何接近的比例。实验稳定性与计算收敛需单独验证。"
              : "RMSD uses the first production snapshot. Contact occupancy is the proportion of samples within a 4 Å heavy-atom cutoff. Experimental stability and convergence require separate validation."}
          </p>
          <ResidueFluctuationTable
            residues={current.residues}
            language={language}
          />
        </details>
      </StructureWorkbench>
    </div>
  );
}
