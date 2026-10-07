"""Bounded contract/complete-link counterexamples, not native chemical acceptance."""

from uuid import uuid4

import pytest

from opendde_workbench.chemistry.cluster_contract import PoseClusterTask
from opendde_workbench.chemistry.cluster_groups import cluster_groups
from opendde_workbench.chemistry.cluster_options import ClusterOptions
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.native_arguments import needs_gpu
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def reference():
    return {
        "asset_id": str(uuid4()),
        "sha256": "a" * 64,
        "version_id": str(uuid4()),
        "record": 0,
        "conformer": 0,
    }


def request():
    frame = reference()
    return {
        "operation": "pose_cluster",
        "pose_set_id": str(uuid4()),
        "pose_set_sha256": "a" * 64,
        "site_set_sha256": "b" * 64,
        "receptor_set_id": str(uuid4()),
        "receptor_set_sha256": "c" * 64,
        "frame": frame,
        "receptors": [
            {
                "member_index": 0,
                "reference": frame,
                "expected_alignment_rmsd_angstrom": 0,
                "residue_pairs": [
                    {
                        "reference": {"chain": "A", "number": i},
                        "moving": {"chain": "A", "number": i},
                    }
                    for i in (1, 2, 3)
                ],
            }
        ],
        "poses": [
            {
                "selection": {"step_id": "pose_000", "record": i},
                "reference": reference(),
                "member_index": 0,
            }
            for i in range(2)
        ],
    }


def test_task_uses_existing_cpu_chemistry_and_exact_complete_input_set():
    task = TASK_ADAPTER.validate_python(request())
    assert isinstance(task, PoseClusterTask)
    assert engine_for(task.operation).id == "chemistry" and not needs_gpu(task)
    assert input_identifiers(task) == {
        str(task.frame.asset_id),
        *(str(p.reference.asset_id) for p in task.poses),
    }
    assert task.options.criterion == "both"
    assert task.options.maximum_symmetry_maps == 1000


def test_invalid_or_ambiguous_sources_cannot_reach_native_execution():
    value = request()
    for patch in (
        {"poses": value["poses"][:1]},
        {"poses": [value["poses"][0], value["poses"][0]]},
        {"name": "  "},
        {"constraints": {"id": str(uuid4()), "sha256": "a" * 64}},
        {"command": "untrusted"},
    ):
        with pytest.raises(ValueError):
            TASK_ADAPTER.validate_python({**value, **patch})
    for key in ("record", "conformer", "version_id"):
        changed = {
            **value["poses"][0],
            "reference": {
                **value["poses"][0]["reference"],
                key: None if key == "version_id" else 1,
            },
        }
        with pytest.raises(ValueError):
            TASK_ADAPTER.validate_python({**value, "poses": [changed, value["poses"][1]]})
    with pytest.raises(ValueError):
        TASK_ADAPTER.validate_python(
            {**value, "poses": [{**p, "member_index": 1} for p in value["poses"]]}
        )


@pytest.mark.parametrize(
    "patch",
    [
        {"maximum_rmsd_angstrom": True},
        {"maximum_rmsd_angstrom": float("nan")},
        {"contact_cutoff_angstrom": 0},
        {"maximum_symmetry_maps": 1001},
        {"cpu": 3},
        {"memory_mib": 512},
        {"criterion": "ligand_align"},
        {"minimum_contact_jaccard": 0},
    ],
)
def test_scientific_limits_do_not_silently_fall_back(patch):
    with pytest.raises(ValueError):
        ClusterOptions(**patch)


def rows(count):
    return [
        {"index": i, "selection": {"step_id": f"pose_{i:03d}", "record": 0}} for i in range(count)
    ]


def pair(a, b, rmsd=0.5, jaccard=0.9, same=True):
    return {
        "left": a,
        "right": b,
        "same_chemical_graph": same,
        "rmsd_angstrom": rmsd,
        "contact_jaccard": jaccard,
    }


def test_complete_link_does_not_bridge_incompatible_modes_and_medoid_is_an_original():
    value = rows(3)
    pairs = [pair(0, 1), pair(1, 2), pair(0, 2, rmsd=4)]
    groups = cluster_groups(value, pairs, ClusterOptions())
    assert [g["members"] for g in groups] == [[0, 1], [2]]
    assert [g["representative"] for g in groups] == [0, 2]
    assert groups == cluster_groups(value, list(reversed(pairs)), ClusterOptions())
    assert groups == cluster_groups(list(reversed(value)), pairs, ClusterOptions())


@pytest.mark.parametrize(
    "metrics", [{"jaccard": None}, {"rmsd": None}, {"same": False}, {"rmsd": 10}]
)
def test_unknown_mapping_empty_contacts_state_difference_and_shift_cannot_merge(metrics):
    result = cluster_groups(rows(2), [pair(0, 1, **metrics)], ClusterOptions())
    assert len(result) == 2


def test_explicit_geometry_mode_retains_missing_contact_evidence_without_using_it():
    assert (
        len(
            cluster_groups(
                rows(2), [pair(0, 1, jaccard=None)], ClusterOptions(criterion="geometry")
            )
        )
        == 1
    )
