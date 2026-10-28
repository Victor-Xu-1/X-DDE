"""Independent native-source check for the evidence-bound example comparison."""

import io
import json
from collections import Counter
from hashlib import sha256
from math import dist, sqrt
from types import SimpleNamespace
from urllib.parse import quote
from urllib.request import urlopen

import numpy as np
from rdkit import Chem
from rdkit.Chem import rdMolAlign

from opendde_workbench.quality.assessment import assess_checks


def verify_comparison(base, data, info):
    pin = info["pin"]
    evidence = {entry["job_id"]: entry for entry in pin["supporting_evidence"]}
    evidence[pin["job_id"]] = pin

    def get(path):
        with urlopen(base + "/api" + path, timeout=20) as response:
            return response.read()

    def artifact(job, name):
        raw = get(f"/jobs/{job}/download?name={quote(name, safe='')}")
        assert sha256(raw).hexdigest() == evidence[job]["artifact_sha256"][name]
        return raw

    def molecules(raw):
        values = list(Chem.ForwardSDMolSupplier(io.BytesIO(raw), removeHs=False))
        assert values and all(m is not None for m in values)
        return [Chem.RemoveHs(m) for m in values]

    def identity(mol):
        return Chem.MolToSmiles(mol, isomericSmiles=True)

    def rmsd(probe, reference):
        assert identity(probe) == identity(reference)
        before = np.array(probe.GetConformer().GetPositions())
        matches = probe.GetSubstructMatches(
            reference, uniquify=False, useChirality=True, maxMatches=4097
        )
        assert 0 < len(matches) <= 4096
        maps = [
            [(probe_index, reference_index) for reference_index, probe_index in enumerate(match)]
            for match in matches
        ]
        value = rdMolAlign.CalcRMS(probe, reference, map=maps, maxMatches=4096)
        assert np.array_equal(before, probe.GetConformer().GetPositions())
        return value

    def ca(raw):
        return {
            (line[21:22], line[22:27], line[17:20]): tuple(
                float(line[i : i + 8]) for i in (30, 38, 46)
            )
            for line in raw.decode().splitlines()
            if line.startswith("ATOM  ")
            and line[12:16].strip() == "CA"
            and line[16:17] in (" ", "A")
        }

    assert pin["job_id"] == data["job_id"] and info["module"]["revision"] == data["revision"]
    assert all(pin["artifact_sha256"].get(k) == v for k, v in data["artifacts"].items())
    for stage in data["supporting"]:
        assert all(
            evidence[stage["job_id"]]["artifact_sha256"].get(k) == v
            for k, v in stage["artifacts"].items()
        )
    docking = {}
    for job in {pose["docking_job"] for pose in data["poses"]}:
        record = json.loads(get("/jobs/" + job))
        result = json.loads(artifact(job, "result.json"))
        assert record["status"] == "succeeded" and result["complete"]
        poses = molecules(artifact(job, result["pose_artifact"]))
        assert len(poses) == len(result["poses"]) == data["method"]["poses_per_receptor"]
        assert {identity(m) for m in poses} == {identity(poses[0])}
        docking[job] = (
            record["request"],
            result,
            poses,
            ca(artifact(job, result["receptor_artifact"])),
        )
    pred = docking[data["poses"][0]["docking_job"]]
    exp = docking[data["poses"][2]["docking_job"]]
    assert pred[0]["ligand"] == exp[0]["ligand"] and pred[0]["options"] == exp[0]["options"]
    assert pred[0]["search"]["reference"] == exp[0]["search"]["reference"]
    assert pred[1]["binary_sha256"] == exp[1]["binary_sha256"]
    assert pred[1]["software_version"] == exp[1]["software_version"] == "1.3.3"
    assert pred[0]["options"]["scoring"] == "vina" and pred[0]["options"]["cnn_scoring"] == "none"
    common = pred[3].keys() & exp[3].keys()
    assert len(common) == data["method"]["matched_ca_atoms"]
    ca_rmsd = sqrt(sum(dist(pred[3][key], exp[3][key]) ** 2 for key in common) / len(common))
    assert abs(ca_rmsd - data["method"]["no_fit_ca_rmsd_angstrom"]) < 1e-8
    compare = data["comparison"]
    assert abs(rmsd(pred[2][1], pred[2][0]) - compare["predicted_top_pair_rmsd_angstrom"]) < 1e-8
    cross = [rmsd(mol, exp[2][0]) for mol in pred[2]]
    assert abs(cross[0] - compare["top_pose_rmsd_between_receptors_angstrom"]) < 1e-8
    assert cross.index(min(cross)) + 1 == compare["nearest_predicted_rank_to_experimental_top"]
    assert abs(min(cross) - compare["nearest_predicted_rmsd_angstrom"]) < 1e-8
    for row in data["poses"]:
        native = docking[row["docking_job"]][1]["poses"][row["rank"] - 1]
        assert native["scores"][0]["value"] == row["score_kcal_mol"]
        quality = json.loads(artifact(row["quality_job"], "result.json"))
        assert (
            quality["inputs"]["molecule"]["sha256"]
            == evidence[row["docking_job"]]["artifact_sha256"][native["artifact"]]
        )
        assert (
            quality["inputs"]["protein"]["sha256"]
            == evidence[row["docking_job"]]["artifact_sha256"][
                docking[row["docking_job"]][1]["receptor_artifact"]
            ]
        )
        checked = assess_checks(
            SimpleNamespace(
                **{**quality, "checks": [SimpleNamespace(**c) for c in quality["checks"]]}
            )
        )
        assert dict(Counter(c["assessment"] for c in checked)) == row["quality"]
        assert quality["metrics"]["smallest_distance_protein"] == row["nearest_protein_angstrom"]
