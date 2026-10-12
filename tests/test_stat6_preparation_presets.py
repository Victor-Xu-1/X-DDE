"""Reviewed STAT6 preparation settings, exact inputs and deposited alternate identity."""
import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.stat6.catalogue import ROOT
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.receptors.native_selection import read_selected, select_atoms
from opendde_workbench.receptors.preparation_options import PreparationOptions
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


@pytest.mark.parametrize('capability', ['biopython.prepare', 'chemistry.states'])
def test_reviewed_settings_load_without_new_tasks_or_modified_input(tmp_path, capability):
    store = Store(tmp_path / 'jobs.sqlite3')
    assets = AssetStore(store, tmp_path / 'assets')
    prepared = prepare_stat6(capability, ScientificStore(store, assets))
    options = prepared.request['options']
    if capability == 'biopython.prepare':
        assert options['chains'] == ['A'] and options['alternate'] == 'A'
        assert options['heterogens'] == 'keep' and not options['waters']
    else:
        assert options['optimization_iterations'] == 1000
        assert options['force_field'] == 'MMFF94s' and options['cpu'] == 1
    again = prepare_stat6(capability, ScientificStore(store, assets))
    assert again.request == prepared.request and not store.list_jobs()


def test_selected_9big_alternate_exists_at_every_ambiguous_site():
    pytest.importorskip('Bio')
    model, _ = read_selected(ROOT / 'inputs' / '9BIG.cif', PreparationOptions(chains=('A',)))
    original = {
        (residue.id, atom.id): atom.child_dict['A'].coord.copy()
        for residue in model['A']
        if residue.id[0] != 'W'
        for atom in residue
        if atom.is_disordered()
    }
    assert len(original) == 8
    atoms, removed, resolved = select_atoms(model, PreparationOptions(chains=('A',), alternate='A'))
    assert len(resolved) == 8 and all(row['alternate'] == 'A' for row in resolved)
    assert atoms and removed and all(row['reason'] == 'water' for row in removed)
    for residue in model['A']:
        for atom in residue:
            key = residue.id, atom.id
            if key in original:
                assert (atom.coord == original[key]).all()
    assert all(not atom.get_altloc().strip() for atom in atoms)
