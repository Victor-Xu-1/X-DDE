"""Pinned engines, full official model files, actual API/Worker and research downloads."""

import json
import os
import sqlite3

import numpy as np
import pytest
from dataset_api_fixture import Campaign
from dataset_native_fixture import public_counts

from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.examples.files import verified_file

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_DATASET_ENGINE") not in {"drugclip", "deli", "gnina"},
    reason="Actual dataset engines run in focused CI or the target server only",
)


def target(campaign):
    structure = campaign.material(
        verified_file(campaign.root / "public", FILES["brd4"]),
        "3MXF.pdb",
        "structure",
        "structure",
    )
    ligand = campaign.material(
        verified_file(campaign.root / "public", FILES["jq1"]),
        "3MXF-JQ1.sdf",
        "ligand",
        "ligand",
    )
    search = {
        "kind": "reference_ligand",
        "frame": structure["source"],
        "reference": ligand["source"],
        "coordinate_basis": "user_confirmed",
    }
    return [structure, ligand], search


def library(campaign):
    material = campaign.material(
        verified_file(campaign.root / "public", FILES["egfr_library"]),
        "ChEMBL-complex-drugs.sdf",
        "library",
        "data",
    )
    return campaign.task(
        "library_prepare",
        {"kind": "chemistry", "mode": "prepare", "supplier": "custom"},
        [material],
    )


def test_official_six_fold_drugclip_index_retrieval_and_identity(tmp_path):
    if os.environ.get("WB_DATASET_ENGINE") != "drugclip":
        pytest.skip("Selected independent engine only")
    import h5py

    with Campaign(tmp_path, ["chemistry", "drugclip", "gnina"]) as campaign:
        prepared, members, _ = library(campaign)
        indexed, result, output = campaign.task(
            "drugclip_index",
            {
                "kind": "drugclip",
                "mode": "index",
                "use": "non_commercial",
                "batch_size": 4,
                "shard_rows": 10,
            },
            sources=[prepared],
        )
        count = members["counts"]["unique_compounds"]
        assert result["counts"]["indexed"] + result["counts"]["rejected"] == count
        assert result["metadata"]["folds"] == 6
        vectors = []
        for item in result["artifacts"]:
            if item["role"] == "molecule_embeddings":
                with h5py.File(output / item["name"]) as file:
                    assert file.attrs["folds_complete"].all()
                    batch = file["vectors"][:]
                    assert batch.shape[1] == 768 and np.isfinite(batch).all()
                    assert np.allclose(
                        np.linalg.norm(batch.reshape(-1, 6, 128), axis=2), 1, atol=1e-5
                    )
                    vectors.append(batch)
        assert sum(map(len, vectors)) == result["counts"]["indexed"]
        materials, search = target(campaign)
        params = {
            "kind": "drugclip",
            "mode": "retrieve",
            "use": "non_commercial",
            "receptor": materials[0]["source"],
            "search": search,
            "top_k": min(10, result["counts"]["indexed"]),
            "retain": 5,
            "alternate_locations": "highest_occupancy",
        }
        _, hits, hits_root = campaign.task("drugclip_retrieve", params, materials, [indexed])
        assert hits["candidates"] and all(
            row["geometry"] in {"none", "unbound_conformer"} for row in hits["candidates"]
        )
        identities = sqlite3.connect(output / "index-members.sqlite")
        known = {row[0] for row in identities.execute("SELECT id FROM members")}
        identities.close()
        assert {row["id"] for row in hits["candidates"]} <= known
        assert all(row["docking_score"] is None for row in hits["candidates"])
        method = json.loads((hits_root / "ranking-method.json").read_text())
        assert len(method["query"]) == 6
        _, diverse, _ = campaign.task(
            "drugclip_retrieve", {**params, "shortlist": "diversity"}, materials, [indexed]
        )
        assert diverse["counts"]["returned"] == hits["counts"]["returned"]
        assert {row["id"] for row in diverse["candidates"]} == {
            row["id"] for row in hits["candidates"]
        }
        assert diverse["counts"]["retained_3d"] == 5
        from dataset_workflow_acceptance import run_screening_chain

        run_screening_chain(
            campaign,
            verified_file(campaign.root / "public", FILES["egfr_library"]),
            materials,
            search,
        )
        campaign.receipt("drugclip")


def test_gnina_actual_shortlist_batch_and_downloaded_poses(tmp_path):
    if os.environ.get("WB_DATASET_ENGINE") != "gnina":
        pytest.skip("Selected independent engine only")
    with Campaign(tmp_path, ["chemistry", "gnina", "plip"]) as campaign:
        prepared, _, output = library(campaign)
        database = sqlite3.connect(output / "library.sqlite")
        selected = [
            row[0]
            for row in database.execute("SELECT id FROM compounds ORDER BY source_record LIMIT 2")
        ]
        database.close()
        subset, candidates, _ = campaign.task(
            "library_subset",
            {"kind": "chemistry", "mode": "subset", "selected_ids": selected},
            sources=[prepared],
        )
        materials, search = target(campaign)
        docking, docked, pose_root = campaign.task(
            "screening_dock",
            {
                "kind": "gnina",
                "mode": "batch",
                "alternate_locations": "highest_occupancy",
                "receptor": materials[0]["source"],
                "search": search,
                "selected_ids": selected,
                "docking": {
                    "cpu": 2,
                    "memory_mib": 8192,
                    "use_gpu": False,
                    "cnn_scoring": "none",
                    "exhaustiveness": 2,
                    "num_modes": 2,
                    "time_limit_seconds": 300,
                },
            },
            materials,
            [subset],
        )
        assert docked["counts"]["selected"] == len(candidates["candidates"])
        assert docked["counts"]["docked"] + docked["counts"]["failed"] == len(selected)
        assert all(
            row["complex_artifact"] and (pose_root / row["complex_artifact"]).is_file()
            for row in docked["candidates"]
        )
        assert docked["candidates"], "A realistic shortlist must produce at least one actual pose"
        assert all(
            row["geometry"] == "binding_pose" and np.isfinite(row["docking_score"])
            for row in docked["candidates"]
        )
        original = verified_file(campaign.root / "public", FILES["brd4"])
        prepared = (pose_root / "receptor.pdb").read_bytes()
        assert b"HETATM" not in prepared
        assert all(
            line in original.splitlines()
            for line in prepared.splitlines()
            if line.startswith(b"ATOM  ")
        )
        complex_name = docked["candidates"][0]["complex_artifact"]
        heterogen = next(
            line
            for line in (pose_root / complex_name).read_text().splitlines()
            if line.startswith("HETATM")
        )
        campaign.interactions(docking["job_id"], complex_name, heterogen[21], int(heterogen[22:26]))
        campaign.receipt("gnina")


def test_deli_real_definition_reads_counts_analysis_series_and_candidates(tmp_path):
    if os.environ.get("WB_DATASET_ENGINE") != "deli":
        pytest.skip("Selected independent engine only")
    import itertools

    from dataset_native_fixture import DELI_REVISION, public_definition, public_del

    with public_del(tmp_path / "public-del") as archive, Campaign(tmp_path, ["deli"]) as campaign:
        definition = campaign.material(
            json.dumps(public_definition(archive)).encode(),
            "UNCDEL006.json",
            "config",
            "definition",
        )
        defined, _, _ = campaign.task(
            "del_validate", {"kind": "deli", "mode": "validate"}, [definition]
        )
        _, enumerated, _ = campaign.task(
            "del_enumerate",
            {
                "kind": "deli",
                "mode": "enumerate",
                "library": "DEL006",
                "selected_members": [["A035", "B040", "C030"], ["A035", "B040", "C031"]],
            },
            sources=[defined],
        )
        assert enumerated["counts"]["unique_compounds"] >= 1
        prefix = "DELi-" + DELI_REVISION + "/examples/UNCDEL006_BRD4_Decode/"
        read_name = prefix + "UNCDEL006_BRD4.fastq"
        with archive.open(read_name) as stream:
            raw = b"".join(itertools.islice(stream, 4000))
        reads = campaign.material(raw, "UNCDEL006-1000-reads.fastq", "reads", "reads", "lane1")
        decoded, quality, _ = campaign.task(
            "del_decode",
            {
                "kind": "deli",
                "mode": "decode",
                "read_samples": [{"input_label": "lane1", "sample": "BRD4_public_reads"}],
            },
            [reads],
            [defined],
        )
        assert quality["counts"]["input_reads"] == 1000 and quality["counts"]["decoded_reads"] > 0
        _, counted, _ = campaign.task(
            "del_count", {"kind": "deli", "mode": "count"}, sources=[decoded]
        )
        assert counted["counts"]["counted_reads"] == quality["counts"]["decoded_reads"]
        counts = campaign.material(
            public_counts(archive, 3000), "UNCDEL006-BRD4.csv", "counts", "counts"
        )
        samples = [
            {"column": f"corrected_index{i}", "group": "BRD4", "role": "target", "replicate": n + 1}
            for n, i in enumerate((2, 3, 4))
        ]
        samples.append({"column": "corrected_index6", "group": "reference", "role": "reference"})
        analysis, analyzed, analyzed_root = campaign.task(
            "del_analyze",
            {
                "kind": "deli",
                "mode": "analyze",
                "samples": samples,
                "cycle_columns": ["ID_A", "ID_B", "ID_C"],
                "comparisons": [
                    {"id": "BRD4_vs_reference", "selection": "BRD4", "reference": "reference"}
                ],
            },
            [counts],
        )
        assert analyzed["counts"]["observed_members"] == 3000
        table = campaign.client.get(
            f"/api/datasets/{analysis['job_id']}/table?view=enrichment&limit=5"
        )
        assert table.status_code == 200 and len(table.json()["rows"]) == 5, table.text
        _, series, _ = campaign.task(
            "del_series",
            {"kind": "deli", "mode": "series", "chosen_comparison": "BRD4_vs_reference"},
            sources=[analysis],
        )
        assert series["counts"]["observed_members"] == 3000
        db = sqlite3.connect(analyzed_root / "analysis.sqlite")
        member = db.execute(
            "SELECT id FROM members WHERE cycles IS NOT NULL ORDER BY ordinal LIMIT 1"
        ).fetchone()[0]
        db.close()
        _, resolved, _ = campaign.task(
            "del_candidates",
            {
                "kind": "deli",
                "mode": "candidates",
                "library": "DEL006",
                "selected_ids": [member],
                "attachment_policy": "cap_hydrogen",
            },
            sources=[analysis, defined],
        )
        assert (
            resolved["counts"]["selected"]
            == resolved["counts"]["resolved"] + resolved["counts"]["failed"]
        )
        assert resolved["candidates"], (
            "The public member must resolve through its actual chemical rules"
        )
        model, modeled, _ = campaign.task(
            "del_model",
            {
                "kind": "deli",
                "mode": "model",
                "chosen_comparison": "BRD4_vs_reference",
                "holdout_cycle": 2,
                "trees": 50,
                "max_training_members": 1000,
            },
            sources=[analysis],
        )
        assert modeled["counts"]["training"] >= 50 and modeled["counts"]["heldout"] >= 20
        _, predictions, _ = campaign.task(
            "del_model",
            {
                "kind": "deli",
                "mode": "model",
                "model_action": "predict",
                "chosen_comparison": "BRD4_vs_reference",
                "max_prediction_members": 3000,
                "retain": 10,
            },
            sources=[model, analysis],
        )
        assert (
            predictions["counts"]["predicted"] + predictions["counts"]["unresolved_structures"]
            == 3000
        )
        assert predictions["metadata"]["prediction_unit"] == "log1p_enrichment"
        assert len(predictions["candidates"]) == 10 and all(
            row["geometry"] == "none" for row in predictions["candidates"]
        )
        measurement = campaign.material(
            b"DEL_ID,value\nUNC11951,nanomolar BRD4 binding reported by ITC\n",
            "UNC11951-reported-binding.csv",
            "counts",
            "counts",
        )
        _, followup, _ = campaign.task(
            "del_followup",
            {
                "kind": "deli",
                "mode": "followup",
                "followup_endpoint": "reported_binding",
                "followup_unit": "qualitative",
                "followup_source": "https://doi.org/10.1186/s13321-026-01296-1",
            },
            [measurement],
            [analysis],
        )
        assert followup["counts"] == {"reported": 1, "matched": 0, "unmatched": 1}
        campaign.receipt("deli")
