"""Actual RDKit/Dimorphite-DL algorithms; this suite runs in the remote scientific job."""

import hashlib
import importlib
from pathlib import Path

import pytest

Chem = pytest.importorskip("rdkit.Chem")
pytest.importorskip("dimorphite_dl")


@pytest.fixture
def native(monkeypatch):
    folder = Path(__file__).resolve().parents[1] / "src/opendde_workbench/chemistry"
    monkeypatch.syspath_prepend(str(folder))
    modules = {}
    for name in ("mapping", "options", "states", "conformers", "runner"):
        # Other standalone adapters have same module names; bind the actual chemistry files.
        spec = importlib.util.spec_from_file_location(name, folder / (name + ".py"))
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(__import__("sys").modules, name, module)
        spec.loader.exec_module(module)
        modules[name] = module
    return modules


def test_real_ph_enumeration_retains_atom_labels_and_produces_acid_anion(native):
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("CC(=O)O"))
    options = native["options"].StateOptions(
        tautomers=False, stereoisomers=False, conformers_per_state=0
    )
    rows, coverage = native["states"].enumerate_states(source, options)
    assert rows and all(r["charge"] == -1 for r in rows)
    assert all(sorted(r["source_to_state_atoms"]) == list(range(4)) for r in rows)
    assert not coverage["budget_limited"]


def test_real_tautomers_unassigned_stereo_and_bounded_coverage(native):
    options = native["options"].StateOptions(
        protonation=False, conformers_per_state=0, max_states=16
    )
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("CC(=O)CC(=O)C"))
    rows, _ = native["states"].enumerate_states(source, options)
    assert len(rows) > 1
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("FC(Cl)Br"))
    rows, _ = native["states"].enumerate_states(source, options)
    assert len(rows) == 2 and len({r["smiles"] for r in rows}) == 2
    limited = options.model_copy(update={"max_states": 1})
    assert native["states"].enumerate_states(source, limited)[1]["budget_limited"]


def test_real_seeded_conformers_have_energy_coordinates_and_original_atom_identity(native):
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("CCCCO"))
    options = native["options"].StateOptions(
        protonation=False, tautomers=False, stereoisomers=False, max_states=1
    )
    rows, status = native["conformers"].prepare_conformers(source, source, options)
    assert status == "completed" and 1 <= len(rows) <= 3
    assert all(r["energy"] is not None and r["converged"] is not None for r in rows)
    assert all(r["molecule"].GetConformer().Is3D() for r in rows)
    assert all(sorted(r["source_to_conformer_atoms"]) == list(range(5)) for r in rows)


def test_unavailable_parameters_and_known_protonation_limit_are_not_fake_success(native):
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("B(O)O"))
    options = native["options"].StateOptions(protonation=False, max_states=1)
    assert (
        native["conformers"].prepare_conformers(source, source, options)[1]
        == "force_field_parameters_unavailable"
    )
    source = native["mapping"].source_molecule(Chem.MolFromSmiles("CC(=O)N1CCCCC1"))
    with pytest.raises(ValueError, match="tertiary-amide"):
        native["states"].enumerate_states(source, native["options"].StateOptions())


def test_actual_sdf_runner_records_method_versions_digests_and_exact_record(native, tmp_path):
    from uuid import uuid4

    (tmp_path / "assets").mkdir()
    file = tmp_path / "assets/library.sdf"
    with Chem.SDWriter(str(file)) as writer:
        writer.write(Chem.MolFromSmiles("CCO"))
        writer.write(Chem.MolFromSmiles("CC(=O)O"))
    identifier = str(uuid4())
    ref = {
        "asset_id": identifier,
        "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
        "record": 1,
        "conformer": 0,
        "version_id": None,
    }
    options = native["options"].StateOptions(
        tautomers=False, stereoisomers=False, max_states=4, conformers_per_state=2
    )
    request = {
        "operation": "molecular_states",
        "molecule": ref,
        "options": options.model_dump(mode="json"),
    }
    output = tmp_path / "output"
    output.mkdir()
    result = native["runner"].run(
        request, {identifier: "/job/assets/library.sdf"}, tmp_path, output
    )
    assert result["source"] == ref and result["states"][0]["charge"] == -1
    assert result["versions"]["rdkit"] and result["versions"]["dimorphite_dl"] == "2.0.2"
    assert len(Chem.SDMolSupplier(str(output / "states.sdf"))) == len(result["states"])
    assert len(Chem.SDMolSupplier(str(output / "conformers.sdf"))) == len(result["conformers"])
    assert all(
        len(Chem.SDMolSupplier(str(output / row["artifact"]))) == 1 for row in result["conformers"]
    )
    ref["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="digest"):
        native["runner"].run(request, {identifier: "/job/assets/library.sdf"}, tmp_path, output)


def test_defined_stereo_survives_identity_mapping_and_reversal_is_rejected(native):
    mapping = native["mapping"]
    for smiles in ("F[C@H](Cl)Br", "C/C=C/C"):
        source = mapping.source_molecule(Chem.MolFromSmiles(smiles))
        copy = Chem.RenumberAtoms(source, list(reversed(range(source.GetNumAtoms()))))
        assert mapping.stereo_preserved(source, copy, mapping.correspondence(source, copy))
        altered = Chem.Mol(source)
        if "@" in smiles:
            altered.GetAtomWithIdx(1).InvertChirality()
        else:
            altered.GetBondWithIdx(1).SetStereo(Chem.BondStereo.STEREOZ)
        assert not mapping.stereo_preserved(
            source, altered, mapping.correspondence(source, altered)
        )
    source = mapping.source_molecule(Chem.MolFromSmiles("C[C@H](O)C(=O)C"))
    rows, coverage = native["states"].enumerate_states(
        source, native["options"].StateOptions(protonation=False, conformers_per_state=0)
    )
    assert rows and coverage["rejected"] > 0
    assert all(
        mapping.stereo_preserved(source, row["molecule"], row["source_to_state_atoms"])
        for row in rows
    )


def test_protonation_fallback_is_an_explicit_failure_not_a_prepared_state(native, monkeypatch):
    from types import SimpleNamespace

    from dimorphite_dl.protonate import run

    source = native["mapping"].source_molecule(Chem.MolFromSmiles("CCO"))

    class FallbackBoundary:
        def __init__(self, **kwargs):
            self.smiles = kwargs["smiles_input"]
            self.stats = SimpleNamespace(fallback_used=1, variants_rejected=0)

        def to_list(self):
            return [self.smiles]

    monkeypatch.setattr(run, "Protonate", FallbackBoundary)
    with pytest.raises(ValueError, match="fallback"):
        native["states"].enumerate_states(source, native["options"].StateOptions())
