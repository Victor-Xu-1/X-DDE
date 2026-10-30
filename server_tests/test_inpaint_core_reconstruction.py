"""Exact retained STAT6 construction experiment, with independent hard invariants."""

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pytest
from inpaint_reconstruction_experiment import reconstruct, refine
from rdkit import Chem, rdBase
from test_inpaint_attachments import molecules
from test_inpaint_attachments import native as native

ROOT = Path(__file__).resolve().parents[1]


def protein_atoms():
    """Select deposited primary heavy atoms; do not rebuild or optimize the protein."""
    source = ROOT / "src/opendde_workbench/examples/stat6/inputs/STAT6-9BIG-observed-receptor.pdb"
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == (
        "96f6d5f4ce3c90f80957e9c0c1d3cd25d213497c836eac6a3b55500fa9c67105"
    )
    table = Chem.GetPeriodicTable()
    rows, identities = [], set()
    for line in raw.decode().splitlines():
        if not line.startswith("ATOM  ") or line[16] not in {" ", "A"}:
            continue
        element = line[76:78].strip()
        if element == "H":
            continue
        key = (line[21:27], line[12:16])
        assert key not in identities
        identities.add(key)
        position = np.array([float(line[start : start + 8]) for start in (30, 38, 46)])
        rows.append((position, table.GetAtomicNumber(element)))
    assert len(rows) == 3227
    return rows


def test_prospective_construction_preserves_atoms_core_and_all_original_files(native):
    verifier, boundary, _ = native
    source, candidate, fixed = molecules()
    original = Chem.MolToMolBlock(candidate)
    source_before = Chem.MolToMolBlock(source)
    legacy = verifier.assess(source, candidate, fixed)
    assert legacy["status"] == "passed"
    assert verifier.assess(source, candidate, fixed, attachment_policy="original_cuts")[
        "status"
    ] == "failed"
    mapping = {row["source_atom"]: row["output_atom"] for row in legacy["mapping"]}
    rebuilt, excluded = reconstruct(source, candidate, mapping, boundary.ports(source, fixed))
    assert excluded
    assert rebuilt.GetNumAtoms() == candidate.GetNumAtoms() == 30
    assert [atom.GetAtomicNum() for atom in rebuilt.GetAtoms()] == [
        atom.GetAtomicNum() for atom in candidate.GetAtoms()
    ]
    assert np.array_equal(
        rebuilt.GetConformer().GetPositions(), candidate.GetConformer().GetPositions()
    )
    assert boundary.assess_attachments(source, rebuilt, mapping)["reason"] is None
    assert Chem.MolToMolBlock(candidate) == original
    assert Chem.MolToMolBlock(source) == source_before


def test_matched_stat6_hard_core_refinement_is_checked_before_any_promotion(native):
    verifier, boundary, _ = native
    source, candidate, fixed = molecules()
    legacy = verifier.assess(source, candidate, fixed)
    mapping = {row["source_atom"]: row["output_atom"] for row in legacy["mapping"]}
    rebuilt, excluded = reconstruct(source, candidate, mapping, boundary.ports(source, fixed))
    result, measured = refine(rebuilt, list(mapping.values()), protein_atoms())
    strict = verifier.assess(source, result, fixed, attachment_policy="original_cuts")
    if directory := os.environ.get("WB_CORE_EXPERIMENT_OUTPUT"):
        target = Path(directory)
        target.mkdir(parents=True, exist_ok=True)
        with Chem.SDWriter(str(target / "prospective-refined.sdf")) as writer:
            writer.write(result)
        (target / "report.json").write_text(
            json.dumps(
                {
                    "scope": "engineering_experiment_not_a_platform_task_or_fixed_example",
                    "rdkit": rdBase.rdkitVersion,
                    "excluded_inferred_edges": excluded,
                    "refinement": measured,
                    "independent_core_check": strict,
                },
                indent=2,
            )
        )
    assert measured["converged"], measured
    assert measured["maximum_core_movement_angstrom"] == 0
    assert strict["status"] == "passed", strict
    assert len(strict["mapping"]) == len(fixed) == 15
    assert boundary.assess_attachments(source, result, mapping)["reason"] is None
    assert result.GetNumHeavyAtoms() == candidate.GetNumHeavyAtoms()


def test_disconnected_construction_does_not_discard_unfavorable_atoms(native):
    verifier, boundary, _ = native
    source, _, fixed = molecules()
    extra = Chem.MolFromSmiles("[Cl-]")
    conformer = Chem.Conformer(1)
    conformer.Set3D(True)
    conformer.SetAtomPosition(0, (100, 100, 100))
    extra.AddConformer(conformer)
    candidate = Chem.CombineMols(source, extra)
    mapping = {index: index for index in fixed}
    with pytest.raises(ValueError, match="disconnected"):
        reconstruct(source, candidate, mapping, boundary.ports(source, fixed))
