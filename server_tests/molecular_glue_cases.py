"""Exact deposited core-chain inputs for isolated molecular-glue acceptance."""

import json
import shutil
from pathlib import Path

from opendde_workbench.deployment.transfers import download

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
        for url, destination, digest, limit in (
            (pdb_url, pdb, case["pdb_sha256"], 8 * 1024**2),
            (sdf_url, sdf, case["sdf_sha256"], 1024**2),
        ):
            download(url, destination, digest, print, lambda: None, limit=limit)
        # The native shared selection policy extracts the explicitly declared chains.
        for name in ("protein1.pdb", "protein2.pdb"):
            shutil.copyfile(pdb, directory / name)
        (directory / "source.json").write_text(
            json.dumps({**case, "pdb_url": pdb_url, "sdf_url": sdf_url}, indent=2)
        )
        case["inputs"] = directory
        cases.append(case)
    return cases
