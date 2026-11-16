import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { SceneInfo } from "../viewer/protocol";
import type { ProteinInterfaceResult } from "./types";
import { ProteinInterfaceContacts } from "./ProteinInterfaceContacts";
import "./interaction-workspace.css";

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
      <div className="interaction-result-method">
        <span>{zh ? "分析方法" : "Analysis method"}</span>
        <strong>PLIP</strong>
        {interfaces.length > 1 && (
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
        )}
      </div>
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
      <div className="interface-contact-context">
        <h3>{active.name}</h3>
        <p>
          {active.interactions.length} {zh ? "个原生接触" : "native contacts"} ·{" "}
          {active.polymer_residues}{" "}
          {zh ? "个已核对的聚合物残基" : "verified polymer residues"}
        </p>
      </div>
      <ProteinInterfaceContacts
        job={job}
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
