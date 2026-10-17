"""Real frozen STAT6 source chemistry and portable subset identities; no DEL or inference."""

import hashlib
import os
from pathlib import Path

import pytest
from dataset_native_fixture import Native

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_LIBRARY_MEMBERS") != "1", reason="scoped native CI"
)
SOURCE = Path("src/opendde_workbench/examples/stat6/inputs/STAT6-CHEMBL982109-38-compounds.sdf")
SOURCE_SHA = "00b497255bd1bad749d47f689e77b00e535018a0f70192a312da42b9981f53d4"


def prepare(native, material=None):
    raw = SOURCE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SOURCE_SHA
    material = material or native.material(raw, ".sdf", "data")
    task = native.task(
        "library_prepare",
        {
            "kind": "chemistry",
            "id_column": "Compound_ID",
            "library_name": "STAT6 measured reference series",
        },
        [material],
    )
    native.module("native_library").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["valid_records"] == result.counts["unique_compounds"] == 38
    return task


@pytest.mark.parametrize("generate", [False, True])
def test_portable_stat6_subset_keeps_public_identifiers_exact_graphs_and_original_sources(
    tmp_path, monkeypatch, generate
):
    import sqlite3

    import numpy as np
    from rdkit import Chem

    native = Native(tmp_path, monkeypatch)
    prepared = prepare(native)
    source = native.capture(prepared)
    database = tmp_path / "sources" / source["job_id"] / "library.sqlite"
    original = database.read_bytes()
    with sqlite3.connect(database) as db:
        chosen = [
            db.execute("SELECT compound_id FROM records WHERE supplier_id=?", (name,)).fetchone()[0]
            for name in ("CHEMBL487451", "CHEMBL374380", "CHEMBL520539")
        ]
    task = native.task(
        "library_subset",
        {
            "kind": "chemistry",
            "mode": "subset",
            "selected_ids": chosen,
            "generate_conformers": generate,
        },
        sources=[source],
    )
    native.module("native_library").run(task.model_dump(mode="json"))
    result = native.check(task)
    poses = Chem.SDMolSupplier(str(tmp_path / "output/candidates.sdf"), removeHs=False)
    sources = Chem.SDMolSupplier(str(SOURCE), removeHs=False)
    for candidate, molecule in zip(result.candidates, poses, strict=True):
        assert molecule.GetProp("_Name") == candidate.display_name
        assert molecule.GetProp("XDDE_SUPPLIER_ID") == candidate.display_name
        assert molecule.GetProp("XDDE_COMPOUND_ID") == candidate.id
        assert molecule.GetProp("XDDE_SOURCE_JOB") == source["job_id"]
        assert int(molecule.GetProp("XDDE_SOURCE_RECORD")) == candidate.source_record
        assert Chem.MolToSmiles(molecule, isomericSmiles=True) == Chem.MolToSmiles(
            sources[candidate.source_record], isomericSmiles=True
        )
        if not generate:
            assert np.array_equal(
                molecule.GetConformer().GetPositions(),
                sources[candidate.source_record].GetConformer().GetPositions(),
            )
        assert molecule.GetConformer().Is3D() == generate
        assert candidate.score is None and candidate.docking_score is None
    assert len(result.candidates) == 3 and database.read_bytes() == original
