"""Exact deposited core-chain inputs for isolated molecular-glue acceptance."""

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from opendde_workbench.deployment.transfers import download, extract

SNAPSHOT_URL = (
    "https://github.com/Victor-Xu-1/X-DDE/releases/download/"
    "proximity-inputs-v1/x-dde-glue-inputs-v1.zip"
)
SNAPSHOT_SHA256 = "cbeb500bfede8086d957279acfc6d6827f66590874a0ced06b3d97f3b1a531c2"

CASES = (
    {
        "id": "5FQD-lenalidomide",
        "entry": "5FQD",
        "chains": ("B", "C"),
        "partner_b": "CK1alpha",
        "ligand_chain": "B",
        "ligand_number": 1438,
        "ligand_heavy_atoms": 19,
        "pdb_sha256": "cc474aa498a5151d63a7d86c196ed83d1f386bfc94b9b27b04f5ba429210e26d",
        "sdf_sha256": "7ccf3fee6970a0a361a20c97f615ad4211bf58bd087363a49fce4382a03fa5b8",
        "omitted": ("DDB1", "structural zinc", "waters", "duplicate crystal copy"),
    },
    {
        "id": "5HXB-CC885",
        "entry": "5HXB",
        "chains": ("Z", "X"),
        "partner_b": "GSPT1",
        "ligand_chain": "Z",
        "ligand_number": 502,
        "ligand_heavy_atoms": 31,
        "pdb_sha256": "4fa66cfafd9592a74d00529af20b6797a6bc714e4da232ed088968a920150757",
        "sdf_sha256": "d4e6d2add77461193566d8f663e01e0958df2d2fb1ce92583976b80052e30621",
        "omitted": ("DDB1", "structural zinc", "duplicate crystal copy"),
    },
)


def prepare_cases(root: Path):
    """No inferred chemistry or inferred pose; SDF uses observed instance coordinates."""
    archive = root / "glue-source-snapshot.zip"
    download(SNAPSHOT_URL, archive, SNAPSHOT_SHA256, print, lambda: None, limit=8 * 1024**2)
    source = root / "glue-source-snapshot"
    extract(archive, source, lambda: None)
    cases = []
    for definition in CASES:
        case = dict(definition)
        directory = root / "glue-inputs" / case["id"]
        directory.mkdir(parents=True)
        pdb = directory / "deposited.pdb"
        sdf = directory / "ligand.sdf"
        pdb_url = f"https://files.rcsb.org/download/{case['entry']}.pdb"
        sdf_url = (
            f"https://models.rcsb.org/v1/{case['entry'].lower()}/ligand?"
            f"auth_asym_id={case['ligand_chain']}&auth_seq_id={case['ligand_number']}&encoding=sdf"
        )
        for original, destination, digest in (
            (source / (case["entry"] + ".pdb"), pdb, case["pdb_sha256"]),
            (source / (case["entry"] + ".sdf"), sdf, case["sdf_sha256"]),
        ):
            if hashlib.sha256(original.read_bytes()).hexdigest() != digest:
                raise ValueError("Frozen molecular-glue source member changed.")
            shutil.copyfile(original, destination)
        # The native shared selection policy extracts the explicitly declared chains.
        for name in ("protein1.pdb", "protein2.pdb"):
            shutil.copyfile(pdb, directory / name)
        (directory / "source.json").write_text(
            json.dumps({**case, "pdb_url": pdb_url, "sdf_url": sdf_url}, indent=2)
        )
        case["inputs"] = directory
        cases.append(case)
    return cases


def freeze_inputs(source: Path, destination: Path):
    """Package already downloaded public bytes; never hash live server timestamps."""
    members = {}
    for case in CASES:
        for suffix in ("pdb", "sdf"):
            name = case["entry"] + "." + suffix
            content = (source / name).read_bytes()
            if hashlib.sha256(content).hexdigest() != case[suffix + "_sha256"]:
                raise ValueError("Only the reviewed original public bytes can be frozen.")
            members[name] = content
    members["source.json"] = json.dumps(
        {
            "schema_version": 1,
            "kind": "deposited_inputs_not_computed_results",
            "cases": CASES,
            "license": "CC0-1.0",
            "license_source": "https://www.rcsb.org/pages/policies",
            "references": [
                "https://www.rcsb.org/structure/5FQD",
                "https://doi.org/10.1038/nature16979",
                "https://www.rcsb.org/structure/5HXB",
                "https://doi.org/10.1038/nature18611",
            ],
            "coordinates": "Observed ligand instances and deposited protein coordinates",
            "modelserver_metadata": "Original response timestamps and timings retained as received",
        },
        indent=2,
    ).encode()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    print(hashlib.sha256(destination.read_bytes()).hexdigest())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--freeze-from", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    arguments = parser.parse_args()
    freeze_inputs(arguments.freeze_from, arguments.destination)
