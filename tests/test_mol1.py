"""Published Mol-1 task semantics and shared execution/input contracts only."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.engine_registry import engine_for
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.mol1_contract import inference_input
from opendde_workbench.requests import TASK_ADAPTER


def task(**payload):
    return IntegratedTask.model_validate(
        {
            "operation": "mol1_predict",
            "name": "Defined complex",
            "payload": {
                "kind": "mol1",
                "components": [
                    {"kind": "protein", "value": "PREACHINGS", "count": 1, "chain_ids": ["A"]}
                ],
                "feature_mode": "none",
                **payload,
            },
        }
    )


def test_real_engine_registration_and_native_entity_compilation():
    value = task(
        additional_seeds=[102],
        components=[
            {"kind": "protein", "value": "PREACHINGS", "chain_ids": ["A"]},
            {"kind": "ligand", "value": "CCD_ATP", "chain_ids": ["B"]},
            {"kind": "dna", "value": "ATGC", "chain_ids": ["C"]},
            {"kind": "rna", "value": "AUGC", "chain_ids": ["D"]},
            {"kind": "ion", "value": "MG", "chain_ids": ["E"]},
        ],
    )
    assert engine_for(value.operation).id == "mol1"
    replay = TASK_ADAPTER.validate_json(value.model_dump_json())
    assert replay == value
    document = inference_input(value, "exact_job", {})[0]
    assert document["modelSeeds"] == [101, 102]
    assert [next(iter(entry)) for entry in document["sequences"]] == [
        "proteinChain",
        "ligand",
        "dnaSequence",
        "rnaSequence",
        "ion",
    ]
    assert document["sequences"][1]["ligand"]["ligand"] == "CCD_ATP"


@pytest.mark.parametrize(
    "change",
    [
        {"constraints": [{"kind": "distance"}]},
        {"model": "mol-1-constraint"},
        {"additional_seeds": [101]},
        {"additional_seeds": [2, 2]},
        {"feature_mode": "search", "allow_network": False},
        {"samples": 1, "sample_chunk": 2},
        {"attention_chunk": 0},
        {"steps": 0},
    ],
)
def test_unsupported_or_ambiguous_settings_never_silently_fall_back(change):
    with pytest.raises((ValidationError, ValueError)):
        task(**change)


def test_every_native_file_requires_an_exact_bound_role_and_version():
    identifier = str(uuid4())
    data = task().model_dump(mode="json")
    data["payload"]["components"][0]["unpaired_msa"] = identifier
    data["payload"]["feature_mode"] = "uploaded"
    with pytest.raises(ValidationError, match="Bind every"):
        IntegratedTask.model_validate(data)
    source = {"asset_id": identifier, "sha256": "a" * 64, "record": 0, "conformer": 0}
    data["inputs"] = [{"role": "msa", "source": source}]
    data["scientific_inputs"] = [source]
    value = IntegratedTask.model_validate(data)
    native = inference_input(value, "msa_job", {identifier: "/input/assets/exact.a3m"})
    assert native[0]["sequences"][0]["proteinChain"]["unpairedMsaPath"] == "/input/assets/exact.a3m"
    data["inputs"][0]["source"] = {**source, "sha256": "b" * 64}
    with pytest.raises(ValidationError, match="exact scientific input versions"):
        IntegratedTask.model_validate(data)


def test_native_covalent_connections_keep_copy_residue_and_atom_index_conventions():
    value = task(
        components=[
            {"kind": "protein", "value": "PREACHINGS"},
            {"kind": "ligand", "value": "CCD_ATP"},
        ],
        covalent_bonds=[
            {
                "left": {"entity": 1, "copy_index": 1, "position": 5, "atom": "SG"},
                "right": {"entity": 2, "copy_index": 1, "position": 1, "atom": "C1"},
            }
        ],
    )
    bond = inference_input(value, "bond_job", {})[0]["covalent_bonds"][0]
    assert bond == {
        "entity1": "1",
        "copy1": 1,
        "position1": "5",
        "atom1": "SG",
        "entity2": "2",
        "copy2": 1,
        "position2": "1",
        "atom2": "C1",
    }
