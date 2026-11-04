"""The read-only review uses effective native files and validates exact alignment queries."""

from copy import deepcopy

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.fold_review import review_fold
from opendde_workbench.harness_contract import HarnessTask
from opendde_workbench.store import Store


def test_review_reports_effective_binder_files_and_reused_chain_ids(tmp_path):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    selected = assets.save("verified.a3m", "msa", b">query\nEVQLVESGG\n")
    original = assets.save("unused.a3m", "msa", b">query\nEVQLVESGA\n")
    template = assets.save("reference.json", "template", b"{}")
    task = HarnessTask(
        tool="fold",
        name="Compare two candidates",
        allow_external=True,
        payload={
            "options": {
                "target_chains": {"A": "ACDE", "T": "FGHI"},
                "binder_chain_options": {
                    "A": {
                        "unpairedMsaPath": "asset:" + selected.id,
                        "templatesPath": "asset:" + template.id,
                    },
                },
                "use_msa": False,
            },
            "candidates": [
                {
                    "candidate_id": "matched",
                    "chains": {
                        "A": {"sequence": "EVQLVESGG", "unpairedMsaPath": "asset:" + original.id},
                    },
                },
                {"candidate_id": "other", "chains": {"B": "EVQLVESGA"}},
            ],
        },
    )
    saved = deepcopy(task.model_dump())
    review = review_fold(task, assets)
    assert task.model_dump() == saved
    assert [chain["chain"] for chain in review["target"]] == ["A", "T"]
    matched, other = review["candidates"]
    assert matched["name"] == "matched"
    assert matched["replaced_target_chains"] == ["A"]
    assert matched["chains"][0]["files"] == [
        {"id": selected.id, "name": selected.name, "role": "unpaired"}
    ]
    assert not other["replaced_target_chains"]
    assert other["chains"][0]["files"] == []
    assert {file["id"] for file in review["source_files"]} == {
        selected.id,
        original.id,
        template.id,
    }

    task.payload["candidates"][0]["chains"]["A"]["sequence"] = "EVQLVESGT"
    with pytest.raises(ValueError, match="Fold chain A MSA differs"):
        review_fold(task, assets)


@pytest.mark.parametrize(
    "patch, message",
    [
        ({"backend": "boltz"}, "Check the OpenDDE backend"),
        ({"placement": {"fold": [0, 0]}}, "Check the OpenDDE backend"),
        ({"unexpected": True}, "Check the OpenDDE backend"),
        ({"options": {"target_chains": {"C": ">query\nACDE"}}}, "Use plain uppercase"),
    ],
)
def test_preview_rejects_unsupported_native_requests_and_ambiguous_sequence(
    tmp_path, patch, message
):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    task = HarnessTask(
        tool="fold",
        name="Input check",
        allow_external=True,
        payload={
            "options": {"target_chains": {"C": "ACDE"}},
            "candidates": [{"candidate_id": "example", "chains": {"A": "EVQLVESGG"}}],
            **patch,
        },
    )
    with pytest.raises(ValueError, match=message):
        review_fold(task, assets)
