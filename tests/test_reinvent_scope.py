"""Actual chemical counterexamples for protected cores and declared attachment sites."""

import pytest
from rdkit import Chem

from opendde_workbench.integrations.native_reinvent_scope import ScaffoldScope

CORE = "CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1"
STUDY = "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"


def test_declared_stat6_core_matches_its_full_source_and_a_new_single_site_side_chain():
    scope = ScaffoldScope(CORE)
    assert scope.matches(Chem.MolFromSmiles(STUDY))
    assert scope.matches(Chem.MolFromSmiles("CN(C)C(=O)c1cc2ccc(CCN3CCOCC3)c(F)c2[nH]1"))
    assert scope.sites == 1


@pytest.mark.parametrize(
    "smiles",
    [
        "CCN(C)C(=O)c1cc2ccc(CCC)c(F)c2[nH]1",  # Extra growth on protected amide methyl.
        "CN(C)C(=O)c1cc2ccc(CCC)cc2[nH]1",  # Protected fluorine removed.
        "CN(C)C(=O)c1cc2ccc(CCC)c(F)c2n1C",  # Protected donor replaced.
        "CN(C)C(=O)c1cc2ccc(CCC)c(F)c2[nH]1.Cl",  # Disconnected product.
        CORE,  # A query attachment point is not a generated molecule.
    ],
)
def test_core_substructure_alone_cannot_pass_changes_outside_the_declared_port(smiles):
    assert not ScaffoldScope(CORE).matches(Chem.MolFromSmiles(smiles))


def test_multiple_ports_stereochemistry_and_isotopes_are_real_constraints():
    scope = ScaffoldScope("*c1ccc(*)cc1")
    assert scope.matches(Chem.MolFromSmiles("Cc1ccc(OC)cc1"))
    assert not scope.matches(Chem.MolFromSmiles("Cc1cc(C)c(OC)cc1"))
    chiral = ScaffoldScope("N[C@@H](*)C(=O)O")
    assert chiral.matches(Chem.MolFromSmiles("N[C@@H](C)C(=O)O"))
    assert not chiral.matches(Chem.MolFromSmiles("N[C@H](C)C(=O)O"))
    isotope = ScaffoldScope("C[13CH](*)C")
    assert isotope.matches(Chem.MolFromSmiles("C[13CH](N)C"))
    assert not isotope.matches(Chem.MolFromSmiles("CC(N)C"))


@pytest.mark.parametrize("smiles", ["CCN", "*.*", "*=C", "*"])
def test_unsupported_or_missing_scaffold_sites_fail_before_sampling(smiles):
    with pytest.raises(ValueError):
        ScaffoldScope(smiles)


def test_native_sampling_configuration_consumes_the_selected_source_before_execution(
    tmp_path, monkeypatch
):
    import importlib
    from pathlib import Path

    from opendde_workbench.integrations import native_reinvent_scope

    monkeypatch.syspath_prepend(str(Path(native_reinvent_scope.__file__).parent))
    native = importlib.import_module("native_reinvent")
    models = tmp_path / "models"
    models.mkdir()
    (models / "libinvent.prior").write_bytes(b"configuration-only fixture; never sampled")
    monkeypatch.setattr(native, "Path", lambda value: models if value == "/models" else Path(value))
    calls = []

    def selected(request):
        calls.append(request["inputs"])
        return Chem.MolFromSmiles(STUDY)

    monkeypatch.setattr(native, "source_molecule", selected)
    request = {
        "payload": {
            "mode": "r_groups",
            "candidates": 20,
            "fragments": [CORE],
            "validate_scaffold_origin": True,
        },
        "options": {"device": "cpu"},
        "inputs": [{"role": "ligand", "source": "exact source fixture"}],
    }
    configuration = native.configuration(request, tmp_path)
    assert calls == [request["inputs"]]
    assert configuration["parameters"]["smiles_file"] == str(tmp_path / "starting-molecules.smi")
    assert (tmp_path / "starting-molecules.smi").read_text() == CORE + "\n"
    monkeypatch.setattr(
        native,
        "source_molecule",
        lambda _: Chem.MolFromSmiles("CCN(C)C(=O)c1cc2ccc(CCC)c(F)c2[nH]1"),
    )
    with pytest.raises(ValueError, match="does not match the source"):
        native.configuration(request, tmp_path)
