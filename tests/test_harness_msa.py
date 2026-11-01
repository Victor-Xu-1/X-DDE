"""A native chain may use only its complete, exact-query A3M before admission."""

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.harness_contract import HarnessTask
from opendde_workbench.store import Store

QUERY = "EVQLVESGG"


@pytest.fixture
def assets(tmp_path):
    return AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")


def fold(sequence, field, value, *, binder_options=False):
    chain = {"sequence": sequence, field: value}
    payload = (
        {
            "candidates": [{"chains": {"A": sequence}}],
            "options": {"binder_chain_options": {"A": {field: value}}},
        }
        if binder_options
        else {"candidates": [{"chains": {"A": chain}}]}
    )
    return HarnessTask(
        name="Protocol source validation", tool="fold", allow_external=True, payload=payload
    )


@pytest.mark.parametrize("field", ["unpairedMsaPath", "pairedMsaPath"])
def test_fold_msa_requires_matching_query(assets, field):
    msa = assets.save("old-chain.a3m", "msa", f">query\n{QUERY}\n".encode())
    task = fold("EVQLVESGA", field, "asset:" + msa.id)
    with pytest.raises(ValueError, match="MSA differs from its sequence"):
        assets.validate_bindings(task)


@pytest.mark.parametrize("binder_options", [False, True])
def test_complete_alignment_follows_effective_native_binder_inputs(assets, binder_options):
    raw = f">query\n{QUERY}\n>protocol\nEVQLV-SGG\n".encode()
    msa = assets.save("alignment.a3m", "msa", raw)
    task = fold(QUERY, "unpairedMsaPath", "asset:" + msa.id, binder_options=binder_options)
    assert msa.id in assets.validate_bindings(task)
    assert assets.path(msa).read_bytes() == raw
    changed = task.model_copy(deep=True)
    changed.payload["candidates"][0]["chains"]["A"] = {"sequence": "EVQLVESGA"}
    if not binder_options:
        changed.payload["candidates"][0]["chains"]["A"]["unpairedMsaPath"] = "asset:" + msa.id
    with pytest.raises(ValueError, match="MSA differs from its sequence"):
        assets.validate_bindings(changed)


def test_invalid_alignment_width_is_not_treated_as_an_empty_msa(assets):
    msa = assets.save("broken.a3m", "msa", f">query\n{QUERY}\n>short\nEVQL\n".encode())
    task = fold(QUERY, "unpairedMsaPath", "asset:" + msa.id)
    with pytest.raises(ValueError, match="same alignment columns"):
        assets.validate_bindings(task)


@pytest.mark.parametrize("field", ["unpaired_msa_path", "paired_msa_path"])
def test_native_ignored_path_alias_cannot_silently_drop_an_explicit_msa(assets, field):
    msa = assets.save("alignment.a3m", "msa", f">query\n{QUERY}\n".encode())
    with pytest.raises(ValueError, match="use unpairedMsaPath and pairedMsaPath"):
        assets.validate_bindings(fold(QUERY, field, "asset:" + msa.id))


def test_native_fold_rejects_paired_csv_and_file_collections(assets):
    msa = assets.save("paired.csv", "msa", f"key,sequence\n-1,{QUERY}\n".encode())
    with pytest.raises(ValueError, match="A3M alignment files"):
        assets.validate_bindings(fold(QUERY, "pairedMsaPath", "asset:" + msa.id))
    with pytest.raises(ValueError, match="requires one selected asset"):
        assets.validate_bindings(fold(QUERY, "pairedMsaPath", ["asset:" + msa.id]))
