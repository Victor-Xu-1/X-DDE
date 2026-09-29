from uuid import uuid4

import pytest

from opendde_workbench.entities import Component, CovalentBond
from opendde_workbench.models import Prediction
from opendde_workbench.parameters import Parameters


def test_extended_native_fields_leave_automatic_chain_ids_to_the_engine():
    request = Prediction(
        name="extended",
        components=[
            Component(
                kind="protein",
                value="MC",
                chain_ids=["A"],
                modifications=[{"position": 1, "ccd": "CCD_MSE"}],
            ),
            Component(kind="protein", value="AC"),
        ],
        parameters=Parameters(seed=101, additional_seeds=[102]),
        covalent_bonds=[
            CovalentBond(
                left={"entity": 1, "position": 2, "atom": "SG"},
                right={"entity": 2, "position": 2, "atom": "SG"},
            )
        ],
    )
    native = request.inference_input("safe")[0]
    assert native["modelSeeds"] == [101, 102]
    assert native["sequences"][0]["proteinChain"]["modifications"] == [
        {"ptmType": "CCD_MSE", "ptmPosition": 1}
    ]
    assert "id" not in native["sequences"][1]["proteinChain"]
    assert native["covalent_bonds"][0] == {
        "entity1": "1",
        "copy1": 1,
        "position1": "2",
        "atom1": "SG",
        "entity2": "2",
        "copy2": 1,
        "position2": "2",
        "atom2": "SG",
    }


def test_uploaded_bindings_are_resolved_without_accepting_host_paths():
    ligand, msa = uuid4(), uuid4()
    request = Prediction(
        name="files",
        components=[
            Component(kind="ligand", ligand_file=ligand),
            Component(kind="protein", value="ACDE", unpaired_msa=msa),
        ],
        parameters=Parameters(feature_mode="uploaded"),
    )
    native = request.inference_input(
        "safe", {str(ligand): "/job/assets/ligand.sdf", str(msa): "/job/assets/query.a3m"}
    )[0]
    assert native["sequences"][0]["ligand"]["ligand"] == "FILE_/job/assets/ligand.sdf"
    assert native["sequences"][1]["proteinChain"]["unpairedMsaPath"] == "/job/assets/query.a3m"
    with pytest.raises(ValueError):
        Component(kind="ligand", ligand_file=ligand, value="CCO")
    with pytest.raises(ValueError):
        Component(kind="protein", value="ACDE", unpaired_msa="/etc/passwd")


@pytest.mark.parametrize(
    "parameters",
    [
        {"additional_seeds": [101]},
        {"additional_seeds": [-1]},
        {"feature_mode": "search"},
        {"use_template": True},
        {"distributed": True},
        {"device": "cpu", "gpu_ids": [0]},
    ],
)
def test_invalid_compute_combinations_are_rejected(parameters):
    with pytest.raises(ValueError):
        Parameters(**parameters)


@pytest.mark.parametrize("mutation", ["missing", "position", "self", "duplicate"])
def test_invalid_covalent_links(mutation):
    bond = {
        "left": {"entity": 1, "position": 1, "atom": "SG"},
        "right": {"entity": 2, "position": 1, "atom": "SG"},
    }
    bonds = [bond]
    if mutation == "missing":
        bond["right"]["entity"] = 3
    if mutation == "position":
        bond["right"]["position"] = 2
    if mutation == "self":
        bond["right"] = bond["left"]
    if mutation == "duplicate":
        bonds.append({"left": bond["right"], "right": bond["left"]})
    with pytest.raises(ValueError):
        Prediction(
            name="invalid",
            components=[Component(kind="protein", value="C"), Component(kind="protein", value="C")],
            covalent_bonds=bonds,
        )


def test_modification_and_uploaded_feature_boundaries():
    with pytest.raises(ValueError):
        Component(kind="protein", value="A", modifications=[{"position": 2, "ccd": "CCD_MSE"}])
    with pytest.raises(ValueError):
        Prediction(
            name="msa",
            components=[Component(kind="protein", value="ACDE")],
            parameters=Parameters(feature_mode="uploaded"),
        )
    with pytest.raises(ValueError):
        Prediction(
            name="tfg",
            components=[Component(kind="protein", value="ACDE")],
            parameters=Parameters(tfg=True),
        )


def test_paired_only_uploaded_msa_is_retained():
    identifier = uuid4()
    request = Prediction(
        name="paired alignment",
        components=[Component(kind="protein", value="ACDE", paired_msa=identifier)],
        parameters=Parameters(feature_mode="uploaded"),
    )
    native = request.inference_input("safe", {str(identifier): "/job/assets/paired.a3m"})[0]
    assert native["sequences"][0]["proteinChain"]["pairedMsaPath"] == "/job/assets/paired.a3m"
    assert "unpairedMsaPath" not in native["sequences"][0]["proteinChain"]
