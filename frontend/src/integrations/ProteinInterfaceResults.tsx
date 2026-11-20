import { useState } from "react";
import { artifactUrl } from "../api";
import { Hint } from "../guided/Hint";
import { SpatialResultSummary } from "../presentation/SpatialResultSummary";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { SceneInfo } from "../viewer/protocol";
import type { ProteinInterfaceResult } from "./types";
import { ProteinInterfaceContacts } from "./ProteinInterfaceContacts";
import "./interaction-workspace.css";
import "../presentation/spatial-result-review.css";

type Props = {
  job: Job;
  interfaces: ProteinInterfaceResult[];
  language: Language;
};

export function ProteinInterfaceResults(props: Props) {
  const identity = JSON.stringify([
    props.job.id,
    props.interfaces.map((item) => [item.structure_artifact, item.source]),
  ]);
  return <InterfaceSelector key={identity} {...props} />;
}

function InterfaceSelector({ job, interfaces, language }: Props) {
  const [selected, setSelected] = useState(0);
  const zh = language === "zh";
  const active = interfaces[selected] ?? interfaces[0];
  if (!active) return null;
  return (
    <section
      className="protein-interface-results contact-workspace"
      aria-label={zh ? "蛋白界面结果" : "Protein interface results"}
    >
      {interfaces.length > 1 && (
        <div className="interaction-result-method">
          <label className="interface-complex-choice">
            {zh ? "复合物" : "Complex"}
            <select
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {interfaces.map((value, index) => (
                <option key={index} value={index}>
                  {value.name} · {value.interactions.length}{" "}
                  {zh ? "接触" : "contacts"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <InterfaceWorkspace
        key={selected}
        job={job}
        active={active}
        language={language}
      />
    </section>
  );
}

function InterfaceWorkspace({
  job,
  active,
  language,
}: {
  job: Job;
  active: ProteinInterfaceResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [sequenceHost, setSequenceHost] = useState<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState<{
    id: string;
    residue: string;
    nonce: number;
  } | null>(null);
  return (
    <StructureWorkbench
      sequenceHostRef={setSequenceHost}
      preview={
        <StructureViewer
          sourceSnapshot
          urls={[artifactUrl(job.id, active.structure_artifact)]}
          expectedStructureSha256={active.source.sha256}
          language={language}
          nativeInteractions={active.interactions}
          focusResidue={focus}
          onSceneLoaded={setScene}
          sequenceHost={sequenceHost}
          onStructureVerification={(verified) => {
            if (!verified) {
              setScene(null);
              setFocus(null);
            }
          }}
        />
      }
    >
      <SpatialResultSummary
        jobId={job.id}
        language={language}
        title={active.name}
        className="interface-summary"
        hint={
          <>
            <span className="interface-method">PLIP</span>
            <Hint
              label={
                zh ? "作用与距离说明" : "Interpreting contacts and distances"
              }
            >
              {zh
                ? "原生化学分类，不是结合能或亲和力；水桥距离表示两侧端点的距离。"
                : "Native chemical classifications, not binding energy or affinity. Water-bridge distances refer to the two endpoint atoms."}
            </Hint>
          </>
        }
        metrics={[
          {
            label: zh ? "原生接触" : "Native contacts",
            value: active.interactions.length,
          },
          {
            label: zh ? "已核对的聚合物残基" : "Verified polymer residues",
            value: active.polymer_residues,
          },
        ]}
        files={[
          {
            artifact: active.table_artifact,
            label: "CSV",
            downloadLabel: zh ? "接触表 CSV" : "Contacts CSV",
          },
          {
            artifact: active.text_artifact,
            label: "TXT",
            downloadLabel: zh ? "原生报告 TXT" : "Native report TXT",
          },
          {
            artifact: active.xml_artifact,
            label: "XML",
            downloadLabel: zh ? "原生报告 XML" : "Native report XML",
          },
          {
            artifact: active.structure_artifact,
            label: zh ? "原始结构" : "Structure",
            downloadLabel: zh ? "原始结构" : "Source structure",
          },
        ]}
      />
      <ProteinInterfaceContacts
        active={active}
        language={language}
        scene={scene}
        focus={focus}
        onSelect={(id, residue) =>
          setFocus((previous) => ({
            id,
            residue,
            nonce: (previous?.nonce ?? 0) + 1,
          }))
        }
      />
    </StructureWorkbench>
  );
}
