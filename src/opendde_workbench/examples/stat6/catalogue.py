"""One STAT6 study profile; archived public cases keep their original catalogue and pins."""

import hashlib
import json
from pathlib import Path
from types import MappingProxyType

from ..catalogue import MODULES as ARCHIVE_MODULES
from ..contracts import CaseStudy, ModuleExample, SourceFile
from .guidance import steps

ROOT = Path(__file__).parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
CASE = CaseStudy.model_validate(MANIFEST["case"])
FILES = {key: SourceFile.model_validate(value) for key, value in MANIFEST["files"].items()}
MODULES = MappingProxyType(
    {
        key: ModuleExample(
            case_id=CASE.id,
            capability_id=key,
            revision=value.revision + 2,
            pinned_run_required=value.pinned_run_required,
            parent_capability=value.parent_capability,
        )
        for key, value in ARCHIVE_MODULES.items()
    }
)


def verified_input(key):
    spec = FILES[key]
    path = ROOT / "inputs" / spec.name
    if path.is_symlink() or not path.is_file() or path.stat().st_size != spec.bytes:
        raise ValueError("The fixed STAT6 input is missing or differs from its reviewed size.")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != spec.sha256:
        raise ValueError("The fixed STAT6 input checksum changed; no replacement was activated.")
    return data


def study_context(capability):
    if capability not in MODULES:
        raise KeyError(capability)
    requirements = []
    if capability == "caver.paths":
        requirements.append(
            (
                "核对保留 AK-1690（A:A1AQQ 701）的 9BIG 链 A 准备 CIF；分析时移除起始配体障碍。",
                "Use the reviewed 9BIG chain-A CIF retaining AK-1690 (A:A1AQQ 701); "
                "remove the starting ligand from geometric obstacles during analysis.",
            )
        )
    if capability in {"gnina.dock", "diffsbdd.prepare", "diffsbdd.generate", "apbs.potential"}:
        requirements.append(
            (
                "9BIG 链 A：明确选择替代位置 A，移除水与非聚合物，另存为蛋白 PDB。",
                "Prepare 9BIG chain A: select alternate A, remove waters and nonpolymers, "
                "and save a protein-only PDB in the original coordinate frame.",
            )
        )
    if capability == "biopython.exposure":
        requirements.append(
            (
                "先完成并核对受体准备，明确替代原子位置，再计算选区暴露面积。",
                "Prepare and review the receptor's alternate positions "
                "before calculating region exposure.",
            )
        )
    if capability.startswith("del."):
        requirements.append(
            (
                "STAT6 的真实库定义、测序或计数数据",
                "Real STAT6 library definition, sequencing or count data",
            )
        )
    if capability in {
        "evolution",
        "compare",
        "campaign",
    }:
        requirements.append(
            (
                "STAT6 相关抗体的真实可变域序列",
                "Actual variable-domain sequences of STAT6-related antibodies",
            )
        )
    if capability == "chemprop.predict":
        requirements.append(
            (
                "STAT6 实测标签数据集或已验证的性质模型",
                "Measured STAT6 training labels or a validated endpoint model",
            )
        )
    if capability == "discovery.disease":
        requirements.append(
            ("选择与 STAT6 研究有关的疾病", "Choose a disease relevant to the STAT6 study")
        )
    if capability in {
        "pose_exploration",
        "pose.cluster",
        "workflows",
        "campaign",
    } or capability in {"library.select", "drugclip.index", "drugclip.screen", "screening.dock"}:
        requirements.append(
            (
                "本研究的口袋、分子库或已完成的上游任务",
                "Study-specific pockets, compound libraries or completed upstream tasks",
            )
        )
    if capability == "openfe.rbfe":
        requirements.append(
            (
                "同系列的第二个分子及可比较的结合姿势",
                "A second congeneric molecule and comparable binding poses",
            )
        )
    if capability in {
        "openmm.dynamics",
        "gromacs.dynamics",
    }:
        requirements.append(
            (
                "指定分子的结合姿势及适合模拟的准备结构",
                "A binding pose of the study molecule and a simulation-ready receptor",
            )
        )
    if capability == "deepternary.model":
        requirements.extend(
            [
                ("STAT6 端与 CRBN 端的结合姿势", "Bound poses for the STAT6 and CRBN arms"),
                (
                    "确认 PROTAC 输入中未指定的手性",
                    "Resolve the unspecified stereochemistry of the PROTAC input",
                ),
            ]
        )
    study = {
        "id": "stat6",
        "target": "STAT6",
        "organism": "Homo sapiens",
        "uniprot": "P42226",
        "template_kind": "research_study",
        "molecules": [
            {
                **row,
                "input_key": next(key for key, file in FILES.items() if file.name == row["file"]),
            }
            for row in MANIFEST["molecules"]
        ],
        "required_materials": requirements,
        "task_target": "IL-4R alpha · STAT6 pathway"
        if capability in {"antibody.humanize", "antibody.number", "fold", "epitope", "campaign"}
        else "STAT6",
        "supporting_sources": MANIFEST.get("supporting_sources", {}),
        "guide": {
            "steps": steps(capability),
            "interpretation": (
                "指定分子的三维文件是已最小化的未结合态构象。"
                "9BIG 中的 AK-1690 与指定 PROTAC 不同；"
                "不能把参考结构或旧 BRD4 结果当作该分子的 STAT6 结果。",
                "Study molecule files are minimized unbound conformers. "
                "AK-1690 in 9BIG differs from the specified PROTAC; "
                "reference structures and archived BRD4 results are not STAT6 results "
                "of this molecule.",
            ),
        },
    }
    if capability == "chemprop.train":
        from .training_inputs import training_context

        return training_context(study)
    if capability == "experimental.evidence":
        from .experimental_inputs import experimental_context

        return experimental_context(study)
    return study
