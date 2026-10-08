"""Changed scientific envelopes, simulation evidence and immutable source contracts only."""

import hashlib
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.engine_registry import engine_for
from opendde_workbench.integrations.backend import ScientificBackend
from opendde_workbench.integrations.result import validate_result
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.settings import Settings
from opendde_workbench.simulations.options import DynamicsPayload, FreeEnergyPayload


def task(fep=False):
    inputs = [
        {
            "role": "structure",
            "source": {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0},
        }
    ]
    if fep:
        inputs.append(
            {
                "role": "library",
                "source": {
                    "asset_id": str(uuid4()),
                    "sha256": "b" * 64,
                    "record": 0,
                    "conformer": 0,
                },
            }
        )
    return TASK_ADAPTER.validate_python(
        {
            "operation": "binding_free_energy" if fep else "molecular_dynamics",
            "name": "TYK2 drug-discovery simulation",
            "inputs": inputs,
            "scientific_inputs": [i["source"] for i in inputs],
            "payload": {"kind": "openfe", "records": [0, 2]}
            if fep
            else {"kind": "openmm", "mode": "dynamics"},
            "options": {"device": "cpu"},
        }
    )


def test_simulations_share_existing_queue_router_and_openmm_environment(tmp_path):
    md, fep = task(), task(True)
    assert isinstance(md.payload, DynamicsPayload)
    assert isinstance(fep.payload, FreeEnergyPayload)
    assert engine_for(md.operation).id == "openmm"
    assert engine_for(fep.operation).id == "openfe"
    for identifier in ("openmm", "openfe", "deepternary"):
        backend = ScientificBackend(
            Settings(
                state_dir=tmp_path,
                image_file=tmp_path / "image",
                code_file=tmp_path / "code",
                model_dir=tmp_path / "models",
                cache_dir=tmp_path / "cache",
            ),
            identifier,
        )
        assert len(backend.files) == len(set(backend.files)) <= 32
        for name in backend.files:
            assert backend.shared_sources.get(name, backend.root / name).is_file()


@pytest.mark.parametrize(
    "change", [{"frames": 500}, {"production_ns": float("nan")}, {"repeats": 0}, {"timestep_fs": 8}]
)
def test_dynamics_budgets_are_strict(change):
    with pytest.raises(ValidationError):
        DynamicsPayload(**change)


def test_free_energy_requires_distinct_selected_original_records_and_bounded_sampling():
    for records in ([0, 0], [-1, 1], list(range(13))):
        with pytest.raises(ValidationError):
            FreeEnergyPayload(records=records)
    value = task(True).model_dump()
    value["inputs"][1]["source"]["record"] = 1
    value["scientific_inputs"] = [i["source"] for i in value["inputs"]]
    with pytest.raises(ValidationError, match="Whole structures"):
        TASK_ADAPTER.validate_python(value)


def test_simulation_result_never_accepts_faked_free_energy_in_a_plan(tmp_path):
    request = task(True)
    for name in ("ligand-1.sdf", "ligand-3.sdf", "network.graphml"):
        (tmp_path / name).write_bytes(b"bound immutable output fixture")
    report = {
        "operation": request.operation,
        "program": "openfe",
        "version": "1.12.0",
        "request_sha256": hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
        "artifact_sha256": {
            f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in tmp_path.iterdir()
        },
        "free_energy": {
            "stage": "plan",
            "method": "OpenFE",
            "unit": "kcal/mol",
            "direction": "B minus A",
            "acceptance": "not_scientifically_accepted",
            "nodes": [
                {"id": "ligand-1", "record": 0, "artifact": "ligand-1.sdf", "smiles": "CC"},
                {"id": "ligand-3", "record": 2, "artifact": "ligand-3.sdf", "smiles": "CCC"},
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "a": "ligand-1",
                    "b": "ligand-3",
                    "mapping_score": 0.8,
                    "atom_map": [[0, 0], [1, 1]],
                }
            ],
        },
    }
    assert validate_result(report, request, tmp_path).free_energy.stage == "plan"
    report["free_energy"]["edges"][0]["delta_delta_g_kcal_mol"] = -4
    with pytest.raises(ValueError, match="planned network"):
        validate_result(report, request, tmp_path)
    report["free_energy"]["edges"][0].pop("delta_delta_g_kcal_mol")
    report["free_energy"]["nodes"][0]["record"] = 1
    with pytest.raises(ValueError, match="original records"):
        validate_result(report, request, tmp_path)
