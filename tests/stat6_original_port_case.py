"""Read exact original-port study outputs; never execute scientific programs."""

import hashlib
import json

import pytest

from opendde_workbench.examples.pins import ExamplePins

GENERATION = "23e97ba7-f90e-484d-a21d-0813454c608d"
STATES = "ff3d98a3-9465-4cbb-a240-8d52996c2104"
DOCKING = "5d2c6867-0563-488a-bda0-9f063458f0d8"
QUALITY = "2647de20-9c41-48fd-93a5-0192275ec38b"


def retained_original_port(settings, store, pins):
    def output(identifier, name="result.json"):
        return settings.state_dir / "jobs" / identifier / "output" / name

    generated = pins.get("reinvent.design", verify=True)
    # The analogue study is deliberately revision 4. The current revision 5
    # studies the supplied warhead; it cannot stand in for this historical case.
    modules = dict(pins.modules)
    modules["gnina.dock"] = modules["gnina.dock"].model_copy(update={"revision": 4})
    docked = ExamplePins(store, settings.state_dir, modules=modules).get("gnina.dock", verify=True)
    assert generated.revision == docked.revision == 4
    assert str(generated.job_id) == GENERATION and str(docked.job_id) == DOCKING
    assert [str(row.job_id) for row in generated.supporting_evidence] == [STATES]
    assert [str(row.job_id) for row in docked.supporting_evidence] == [QUALITY]
    assert generated.review and "not pocket-conditioned" in generated.review.limitations
    assert docked.review and "not a unique binding mode" in docked.review.limitations
    result = json.loads(output(GENERATION).read_bytes())
    assert result["complete"] and len(result["candidates"]) == 18
    first = result["candidates"][0]
    molecule = output(GENERATION, first["artifact"])
    assert hashlib.sha256(molecule.read_bytes()).hexdigest() == (
        "4781e2131d30e901903c2f7f4bc4b7dbe03a582c4e654bc38a5192ef5db2cefc"
    )
    states = json.loads(output(STATES).read_bytes())
    assert len(states["states"]) == 10 and len(states["conformers"]) == 20
    assert states["source"]["sha256"] == hashlib.sha256(molecule.read_bytes()).hexdigest()
    docking = json.loads(output(DOCKING).read_bytes())
    request = store.get(DOCKING).request
    assert request.ligand.record == 2
    assert request.receptor == request.search.frame
    assert docking["receptor"] == request.receptor.model_dump(mode="json")
    assert docking["ligand"]["sha256"] == states["artifact_sha256"]["conformers.sdf"]
    assert docking["search"]["box"]["center"] == [1.7015, -44.563, -25.1055]
    assert len(docking["poses"]) == 20
    scores = [row["scores"][0]["value"] for row in docking["poses"]]
    assert scores[0] == pytest.approx(-5.34531)
    assert scores[1] - scores[0] == pytest.approx(0.00022)
    quality = json.loads(output(QUALITY).read_bytes())
    assert quality["inputs"]["protein"] == docking["receptor"]
    assert (
        quality["inputs"]["molecule"]["sha256"]
        == hashlib.sha256(output(DOCKING, "pose-001.sdf").read_bytes()).hexdigest()
    )
    metrics = quality["metrics"]
    assert metrics["number_clashes"] == metrics["num_pairwise_clashes_protein"] == 0
    assert metrics["smallest_distance_protein"] == pytest.approx(2.8564764361)
    assert metrics["number_double_bonds_checked"] == 0
    assert all(
        metrics.get(key) is None
        for key in (
            "smallest_distance_waters",
            "smallest_distance_organic_cofactors",
            "smallest_distance_inorganic_cofactors",
            "volume_overlap_waters",
            "volume_overlap_organic_cofactors",
            "volume_overlap_inorganic_cofactors",
        )
    )
    return {
        "generated": GENERATION,
        "states": STATES,
        "docking": DOCKING,
        "quality": QUALITY,
        "binding_validated": False,
    }
