"""Real RDKit/DELi algorithms, public complex chemistry and scientific boundary cases."""

import csv
import hashlib
import io
import json
import os
import sqlite3

import numpy as np
import pytest
from dataset_native_fixture import Native, public_counts, public_del
from dataset_native_fixture import public_definition as public_def

from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.examples.files import verified_file

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_DATASET_NATIVE") != "1",
    reason="Native dataset algorithms run in scoped CI or the target server",
)


@pytest.fixture
def native(tmp_path, monkeypatch):
    return Native(tmp_path, monkeypatch)


@pytest.fixture(scope="module")
def deli_archive(tmp_path_factory):
    with public_del(tmp_path_factory.mktemp("public-del")) as archive:
        yield archive


def test_real_public_drug_library_preserves_stereochemistry_supplier_records_and_failures(native):
    from rdkit import Chem

    raw = verified_file(native.root / "public", FILES["egfr_library"])
    supplier = Chem.SDMolSupplier()
    supplier.SetData(raw.decode(), removeHs=False)
    assert len(supplier) >= 5
    rows = [
        (f"EGFR-{index}", Chem.MolToSmiles(molecule, isomericSmiles=True))
        for index, molecule in enumerate(supplier)
        if molecule is not None
    ]
    rows += [
        ("second-supplier-offer", rows[0][1]),
        ("invalid", "this-is-not-smiles"),
        ("stereo_R", "C[C@H](O)c1ccccc1"),
        ("stereo_S", "C[C@@H](O)c1ccccc1"),
        ("sodium_salt", "[Na+].O=C([O-])c1ccccc1"),
    ]
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ID", "SMILES"])
    writer.writerows(rows)
    material = native.material(buffer.getvalue().encode(), ".csv", "data")
    task = native.task(
        "library_prepare",
        {
            "kind": "chemistry",
            "supplier": "chemdiv",
            "library_name": "Public ChEMBL EGFR compounds",
        },
        [material],
    )
    native.module("native_library").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["source_records"] == len(rows)
    assert result.counts["rejected_records"] == 1
    assert result.counts["duplicate_chemical_records"] >= 1
    database = sqlite3.connect(native.root / "output/library.sqlite")
    structures = {row[0] for row in database.execute("SELECT smiles FROM compounds")}
    assert Chem.MolToSmiles(Chem.MolFromSmiles(rows[-3][1]), isomericSmiles=True) in structures
    assert Chem.MolToSmiles(Chem.MolFromSmiles(rows[-2][1]), isomericSmiles=True) in structures
    assert any("[Na+]" in value and "." in value for value in structures)
    chosen = [
        row[0]
        for row in database.execute("SELECT id FROM compounds ORDER BY source_record LIMIT 3")
    ]
    database.close()
    source = native.capture(task)
    subset = native.task(
        "library_subset",
        {"kind": "chemistry", "mode": "subset", "selected_ids": chosen},
        sources=[source],
    )
    native.module("native_library").run(subset.model_dump(mode="json"))
    extracted = native.check(subset)
    assert len(extracted.candidates) == 3
    poses = Chem.SDMolSupplier(str(native.root / "output/candidates.sdf"))
    assert all(molecule.GetConformer().Is3D() for molecule in poses)
    assert all(row.geometry == "unbound_conformer" for row in extracted.candidates)


def test_exact_segmented_topk_matches_full_ranking_and_stable_ties(native):
    module = native.module("retrieval_topk")
    rng = np.random.default_rng(2026)
    vectors = rng.normal(size=(10003, 6, 128)).astype(np.float32)
    vectors /= np.linalg.norm(vectors, axis=2, keepdims=True)
    query = rng.normal(size=(6, 128)).astype(np.float32)
    query /= np.linalg.norm(query, axis=1, keepdims=True)
    full = module.fold_scores(vectors.reshape(-1, 768), query)
    mean, deviation = module.calibration(full[:1000])
    ranked = ((full - mean) / deviation).mean(axis=1)
    expected = np.lexsort((np.arange(len(full)), -ranked))[:73]
    top = module.TopK(73)
    for start in range(0, len(full), 257):
        part = full[start : start + 257]
        top.add(((part - mean) / deviation).mean(axis=1), part.mean(axis=1), 0, start)
    assert [row[3] for row in top.rows()] == expected.tolist()
    ties = module.TopK(3)
    ties.add(np.ones(10), np.ones(10), 1, 0)
    ties.add(np.ones(10), np.ones(10), 0, 0)
    assert [(row[2], row[3]) for row in ties.rows()] == [(0, 0), (0, 1), (0, 2)]
    with pytest.raises(ValueError, match="variation"):
        module.calibration(np.ones((20, 6)))


def test_del_public_definition_and_selected_complex_members_use_native_enumeration(
    native, deli_archive
):
    value = public_def(deli_archive)
    material = native.material(json.dumps(value).encode(), ".json", "definition")
    task = native.task("del_validate", {"kind": "deli", "mode": "validate"}, [material])
    native.module("native_del_library").validate(task.model_dump(mode="json"))
    checked = native.check(task)
    assert checked.counts["theoretical_members"] >= 500000
    assert len(checked.metadata["cycles"]) == 3
    source = native.capture(task)
    task = native.task(
        "del_enumerate",
        {
            "kind": "deli",
            "mode": "enumerate",
            "library": "DEL006",
            "selected_members": [["A035", "B040", "C030"], ["A010", "B047", "C060"]],
        },
        sources=[source],
    )
    native.module("native_del_library").enumerate_members(task.model_dump(mode="json"))
    checked = native.check(task)
    assert checked.counts["enumerated"] == 2
    assert all(len(candidate.smiles) > 30 for candidate in checked.candidates)
    database = sqlite3.connect(native.root / "output/library.sqlite")
    assert database.execute("SELECT COUNT(*) FROM del_members").fetchone()[0] == 2
    assert (
        database.execute("SELECT COUNT(*) FROM compounds").fetchone()[0]
        == checked.counts["unique_compounds"]
    )
    database.close()


def test_public_del_counts_enrichment_matches_deli_and_supports_series_followup(
    native, deli_archive
):
    import pandas as pd
    from deli.analysis.cube_class import DELi_Cube

    maximum = 2000000 if os.environ.get("WB_DATASET_FULL_CASE") == "1" else 3000
    raw = public_counts(deli_archive, maximum)
    frame = pd.read_csv(io.BytesIO(raw))
    assert len(frame) >= 1000
    inputs = native.material(raw, ".csv", "counts")
    samples = [
        {
            "column": f"corrected_index{index}",
            "group": "BRD4",
            "role": "target",
            "replicate": position + 1,
        }
        for position, index in enumerate((2, 3, 4))
    ]
    samples.append({"column": "corrected_index6", "group": "reference", "role": "reference"})
    smiles = next((name for name in ("SMILES", "smiles", "smi") if name in frame.columns), "")
    task = native.task(
        "del_analyze",
        {
            "kind": "deli",
            "mode": "analyze",
            "samples": samples,
            "comparisons": [
                {"id": "BRD4_vs_reference", "selection": "BRD4", "reference": "reference"}
            ],
            "cycle_columns": ["ID_A", "ID_B", "ID_C"],
            "smiles_column": smiles,
        },
        [inputs],
    )
    native.module("native_del_analysis").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["observed_members"] == len(frame)
    cube = DELi_Cube(
        frame,
        "DEL_ID",
        {"BRD4": [f"corrected_index{index}" for index in (2, 3, 4)]},
        control_cols={"BRD4": ["corrected_index6"]},
    )
    expected = cube.maximum_likelihood_enrichment_ratio().set_index("DEL_ID")["BRD4_MLE"]
    database = sqlite3.connect(native.root / "output/analysis.sqlite")
    calculated = dict(database.execute("SELECT member,score FROM enrichment"))
    assert all(
        np.isclose(value, expected.loc[identifier], rtol=1e-11)
        for identifier, value in calculated.items()
    )
    top = database.execute("SELECT member FROM enrichment ORDER BY score DESC LIMIT 2").fetchall()
    database.close()
    source = native.capture(task)
    series = native.task(
        "del_series",
        {"kind": "deli", "mode": "series", "chosen_comparison": "BRD4_vs_reference"},
        sources=[source],
    )
    native.module("native_del_series").run(series.model_dump(mode="json"))
    grouped = native.check(series)
    assert grouped.counts["observed_members"] == len(frame)
    assert grouped.counts["series"] > 20
    view = json.loads((native.root / "output/series-view.json").read_text())
    assert view["missing_pairs"] == "unobserved"
    native.capture(series)
    # Explicit user measurements are kept separate from the computed sequencing enrichment.
    measured = f"DEL_ID,value\n{top[0][0]},32\nunknown_member,999\n".encode()
    material = native.material(measured, ".csv", "counts")
    followup = native.task(
        "del_followup", {"kind": "deli", "mode": "followup"}, [material], [source]
    )
    native.module("native_del_followup").run(followup.model_dump(mode="json"))
    reported = native.check(followup)
    assert reported.counts == {"reported": 2, "matched": 1, "unmatched": 1}
    assert reported.metadata["endpoint"] == "KD"


def test_del_exact_count_model_zero_reference_and_missing_cells_are_not_infinite_hits(native):
    stats = native.module("del_statistics")
    score, lower, upper = stats.enrichment([0, 20], [0, 0], 1000, 1000)
    assert score[0] == 1
    assert np.isfinite(score).all() and np.isfinite(lower).all() and np.isfinite(upper).all()
    assert score[1] > 1 and lower[1] < score[1] < upper[1]
    with pytest.raises(ValueError, match="nonzero"):
        stats.enrichment([20], [0], 1000, 0)
    table = native.module("del_count_table")
    for value in ("", "NA", "NaN", "-1", "1.5", "inf"):
        with pytest.raises(ValueError):
            table.count(value)
    assert table.count("123.0") == 123


def test_del_native_decode_and_compound_scoped_umi_counting_reconcile_public_reads(
    native, deli_archive
):
    import itertools

    from dataset_native_fixture import DELI_REVISION

    value = public_def(deli_archive)
    definition = native.material(json.dumps(value).encode(), ".json", "definition")
    task = native.task("del_validate", {"kind": "deli", "mode": "validate"}, [definition])
    native.module("native_del_library").validate(task.model_dump(mode="json"))
    source = native.capture(task)
    path = "DELi-" + DELI_REVISION + "/examples/UNCDEL006_BRD4_Decode/UNCDEL006_BRD4.fastq"
    with deli_archive.open(path) as file:
        # These are real public selection reads; the declared case deliberately bounds its sample.
        reads = b"".join(itertools.islice(file, 4000))
    material = native.material(reads, ".fastq", "reads", "BRD4")
    decode = native.task(
        "del_decode",
        {
            "kind": "deli",
            "mode": "decode",
            "read_samples": [{"input_label": "BRD4", "sample": "BRD4"}],
            "library_errors": 2,
        },
        [material],
        [source],
    )
    native.module("native_del_decode").run(decode.model_dump(mode="json"))
    decoded = native.check(decode)
    assert decoded.counts["input_reads"] == 1000
    assert decoded.counts["decoded_reads"] > 100
    assert decoded.counts["decoded_reads"] + decoded.counts["rejected_reads"] == 1000
    source = native.capture(decode)
    count = native.task(
        "del_count",
        {"kind": "deli", "mode": "count", "umi_method": "directional"},
        sources=[source],
    )
    native.module("native_del_count").run(count.model_dump(mode="json"))
    counted = native.check(count)
    assert counted.counts["counted_reads"] == decoded.counts["decoded_reads"]
    database = sqlite3.connect(native.root / "output/counts.sqlite")
    assert all(
        0 < corrected <= unique <= raw
        for raw, unique, corrected in database.execute(
            "SELECT raw,unique_umi,corrected_umi FROM counts"
        )
    )
    database.close()


def test_del_raw_counts_without_umi_cannot_be_presented_as_pcr_corrected(native):
    from uuid import uuid4

    # An actual un-UMI'd DEL count input is valid raw evidence but not unique-molecule evidence.
    database = sqlite3.connect(native.root / "output/decoded.sqlite")
    database.execute(
        "CREATE TABLE reads (sample TEXT,library TEXT,member TEXT,cycles TEXT,umi TEXT,"
        "count INTEGER)"
    )
    database.execute(
        "INSERT INTO reads VALUES (?,?,?,?,?,?)",
        ("s1", "DEL006", "DEL006-A035-B040-C030", '["A035","B040","C030"]', "", 12),
    )
    database.commit()
    database.close()
    source_job = str(uuid4())
    root = native.root / "sources" / source_job
    root.mkdir()
    import shutil

    shutil.move(native.root / "output/decoded.sqlite", root / "decoded.sqlite")
    file = root / "decoded.sqlite"
    summary = {
        "data_kind": "decoded",
        "counts": {"decoded_reads": 12},
        "artifacts": [
            {
                "name": "decoded.sqlite",
                "size": file.stat().st_size,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            }
        ],
    }
    report = root / "result.json"
    report.write_text(json.dumps(summary))
    source = {
        "job_id": source_job,
        "role": "decoded",
        "report_sha256": hashlib.sha256(report.read_bytes()).hexdigest(),
    }
    corrected = native.task("del_count", {"kind": "deli", "mode": "count"}, sources=[source])
    with pytest.raises(ValueError, match="lacks valid UMIs"):
        native.module("native_del_count").run(corrected.model_dump(mode="json"))
