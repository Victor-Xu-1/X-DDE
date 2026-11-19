import type { Language } from "../types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { ResearchTable } from "../presentation/ResearchTable";
import { SimulationPlot } from "./SimulationPlot";
import type { DynamicsFrame, DynamicsResult, Residue } from "./types";

type Replica = DynamicsResult["replicas"][number];
type Contact = Replica["contacts"][number];
type Fluctuation = Replica["residues"][number];

const colors = ["#5865d8", "#18998b", "#b773ab"];
const residueLabel = (row: Residue) =>
  `${row.chain}:${row.name}${row.number}${row.insertion}`;
const residueId = (row: Residue) =>
  `${row.chain}:${row.number}:${row.insertion}`;

export function DynamicsAnalysis({
  replicas,
  repeat,
  snapshot,
  hasLigand,
  language,
  onTime,
  onResidue,
}: {
  replicas: DynamicsResult["replicas"];
  repeat: number;
  snapshot: DynamicsFrame;
  hasLigand: boolean;
  language: Language;
  onTime(time: number, series: number): void;
  onResidue(residue: Residue, series?: number): void;
}) {
  const zh = language === "zh";
  const name = (replica: (typeof replicas)[number], index: number) => ({
    label: `${zh ? "重复" : "Repeat"} ${replica.repeat}`,
    color: colors[index % colors.length],
  });
  const timePlot = (
    title: string,
    units: string,
    measurement: (frame: DynamicsFrame) => number | null,
  ) => (
    <SimulationPlot
      title={title}
      xLabel={zh ? "时间（ns）" : "Time (ns)"}
      yLabel={units}
      series={replicas.map((replica, index) => ({
        ...name(replica, index),
        points: replica.frames.flatMap((frame) => {
          const y = measurement(frame);
          return y === null ? [] : [{ x: frame.time_ns, y }];
        }),
      }))}
      selectedX={snapshot.time_ns}
      onSelect={onTime}
      language={language}
    />
  );
  return (
    <ResearchTabs
      label={zh ? "轨迹分析" : "Trajectory analysis"}
      tabs={[
        {
          id: "backbone",
          label: zh ? "骨架" : "Backbone",
          content: timePlot(
            zh ? "骨架稳定性" : "Backbone stability",
            "RMSD (Å)",
            (frame) => frame.backbone_rmsd_angstrom,
          ),
        },
        ...(hasLigand
          ? [
              {
                id: "ligand",
                label: zh ? "配体" : "Ligand",
                content: timePlot(
                  zh ? "结合姿势稳定性" : "Bound-pose stability",
                  zh ? "配体 RMSD (Å)" : "Ligand RMSD (Å)",
                  (frame) => frame.ligand_rmsd_angstrom,
                ),
              },
            ]
          : []),
        {
          id: "residues",
          label: "RMSF",
          content: (
            <SimulationPlot
              title={zh ? "残基波动" : "Residue fluctuations"}
              xLabel={zh ? "残基序列位置" : "Residue sequence position"}
              yLabel="RMSF (Å)"
              series={replicas.map((replica, index) => ({
                ...name(replica, index),
                points: replica.residues.map((residue, position) => ({
                  x: position + 1,
                  y: residue.rmsf_angstrom,
                  label: residueLabel(residue),
                })),
              }))}
              language={language}
              onSelect={(position, index) => {
                const residue =
                  replicas[index]?.residues[Math.round(position) - 1];
                if (residue) onResidue(residue, index);
              }}
            />
          ),
        },
        {
          id: "radius",
          label: "Rg",
          content: timePlot(
            zh ? "结构紧致度" : "Structural compactness",
            "Rg (Å)",
            (frame) => frame.radius_gyration_angstrom,
          ),
        },
        {
          id: "energy",
          label: zh ? "势能" : "Energy",
          content: timePlot(
            zh ? "体系势能" : "System potential energy",
            zh ? "势能 (kJ/mol)" : "Energy (kJ/mol)",
            (frame) => frame.potential_kj_mol,
          ),
        },
        ...(hasLigand
          ? [
              {
                id: "contacts",
                label: zh ? "接触" : "Contacts",
                content: (
                  <ResearchTable<Contact>
                    rows={replicas[repeat].contacts}
                    language={language}
                    title={zh ? "结合接触占有率" : "Binding-contact occupancy"}
                    onSelect={(row) => onResidue(row)}
                    rowId={residueId}
                    exportName="contact-occupancy.csv"
                    columns={[
                      {
                        key: "residue",
                        label: zh ? "氨基酸" : "Residue",
                        value: residueLabel,
                      },
                      {
                        key: "occupancy",
                        label: zh ? "接触占有率" : "Occupancy",
                        numeric: true,
                        value: (row) => row.occupancy,
                        render: (row) => (
                          <span className="simulation-occupancy">
                            <meter min={0} max={1} value={row.occupancy} />
                            {(row.occupancy * 100).toFixed(1)}%
                          </span>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

export function ResidueFluctuationTable({
  residues,
  language,
}: {
  residues: Replica["residues"];
  language: Language;
}) {
  return (
    <ResearchTable<Fluctuation>
      rows={residues}
      language={language}
      title="RMSF"
      rowId={residueId}
      exportName="residue-rmsf.csv"
      columns={[
        {
          key: "residue",
          label: language === "zh" ? "残基" : "Residue",
          value: residueLabel,
        },
        {
          key: "rmsf",
          label: "RMSF (Å)",
          numeric: true,
          value: (row) => row.rmsf_angstrom,
        },
      ]}
    />
  );
}
