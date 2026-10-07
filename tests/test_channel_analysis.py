"""Exact task intent, finite resource bounds and immutable managed-runtime contracts."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.engine_registry import engine_for
from opendde_workbench.locations import atomic_json
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers
from opendde_workbench.settings import Settings
from opendde_workbench.space.contract import ChannelTask
from opendde_workbench.space.image import lock_digest
from opendde_workbench.space.options import ChannelOptions
from opendde_workbench.space.runtime import configuration


def task():
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    return ChannelTask(
        structure=ref,
        scientific_inputs=[ref],
        starting_regions=[{"chain": "A", "number": 604, "resname": "E20"}],
    )


def test_channels_share_exact_task_routing_and_source():
    value = task()
    assert TASK_ADAPTER.validate_python(value.model_dump()) == value
    assert input_identifiers(value) == {str(value.structure.asset_id)}
    assert engine_for(value.operation).id == "caver"
    for patch in (
        {"scientific_inputs": []},
        {"options": {"context_chains": ["B"]}},
        {"starting_regions": [value.starting_regions[0]] * 2},
        {"structure": value.structure.model_copy(update={"record": 1})},
    ):
        with pytest.raises(ValidationError):
            ChannelTask.model_validate({**value.model_dump(), **patch})


@pytest.mark.parametrize(
    "patch",
    [
        {"probe_radius_angstrom": float("nan")},
        {"probe_radius_angstrom": 0},
        {"context_chains": ["A", "A"]},
        {"context_chains": ["A\x00"]},
        {"cpu": True},
        {"profile_step_angstrom": True},
        {"maximum_candidates": 10000},
        {"memory_mib": 512},
        {"timeout_seconds": 10000},
        {"alternate": "auto"},
    ],
)
def test_channel_resources_and_source_choices_are_bounded(patch):
    with pytest.raises(ValidationError):
        ChannelOptions(**patch)


def test_managed_channel_runtime_is_dynamic_and_exact(tmp_path):
    state, root = tmp_path / "state", tmp_path / "components"
    state.mkdir()
    root.mkdir()
    settings = Settings(
        state_dir=state,
        image_file=state / "image",
        code_file=state / "code",
        model_dir=root / "models",
        cache_dir=state / "cache",
    )
    with pytest.raises(ValueError):
        configuration(settings)
    atomic_json(state / "deployment.json", {"root": str(root)})
    entry = {
        "version": "3.0.2",
        "image": "sha256:" + "a" * 64,
        "runtime_lock_sha256": lock_digest(),
    }
    atomic_json(root / "installed.json", {"caver": entry})
    assert configuration(settings) == entry["image"]
    atomic_json(root / "installed.json", {"caver": {**entry, "image": "sha256:" + "b" * 64}})
    assert configuration(settings) == "sha256:" + "b" * 64
    for patch in (
        {"image": "mutable:latest"},
        {"version": "3.0.3-beta"},
        {"runtime_lock_sha256": "b" * 64},
    ):
        atomic_json(root / "installed.json", {"caver": {**entry, **patch}})
        with pytest.raises(ValueError):
            configuration(settings)
