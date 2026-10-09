"""Installation transport is bounded; native dependency identities remain authoritative."""

from pathlib import Path

import pytest

from opendde_workbench.integrations import image
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest


@pytest.mark.parametrize("program", ["deepternary", "boltz", "chemprop"])
def test_native_image_retains_dependency_bytes_hash_check_and_finite_transport(tmp_path, program):
    spec = PROGRAMS[program]
    before_recipe = recipe_digest(program)
    before_lock = image.lock_digest(program)
    source = tmp_path / "source" if spec.get("source") else None
    if source:
        source.mkdir()
        for patch in spec.get("source", {}).get("patches", []):
            file = source / patch["file"]
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(patch["old"])
    dependencies = {}
    for entry in spec.get("source_dependencies", []):
        folder = tmp_path / entry["id"]
        folder.mkdir()
        dependencies[entry["id"]] = folder
    context = tmp_path / "image-context"
    image.prepare_context(program, context, source, extra_sources=dependencies)
    locked = Path(image.__file__).with_name("recipes") / (program + ".txt")
    assert (context / "requirements.txt").read_bytes() == locked.read_bytes()
    dockerfile = (context / "Dockerfile").read_text()
    command = next(line for line in dockerfile.splitlines() if "--require-hashes" in line)
    assert "--timeout 120" in command and "--retries 3" in command
    assert "--require-hashes -r /tmp/requirements.txt" in command
    assert "&& python -m pip check" in command
    assert "--trusted-host" not in command and "|| true" not in command
    assert f'org.xdde.science.recipe="{before_recipe}"' in dockerfile
    assert f'org.xdde.science.lock="{before_lock}"' in dockerfile
    assert recipe_digest(program) == before_recipe and image.lock_digest(program) == before_lock


def test_conda_only_environment_keeps_its_existing_installation_transaction(tmp_path):
    assert not PROGRAMS["plip"]["pip"]
    context = tmp_path / "conda-context"
    image.prepare_context("plip", context)
    locked = Path(image.__file__).with_name("recipes") / "plip.conda.txt"
    assert (context / "conda-explicit.txt").read_bytes() == locked.read_bytes()
    dockerfile = (context / "Dockerfile").read_text()
    assert "micromamba install -y -n base --file /tmp/conda-explicit.txt" in dockerfile
    assert "--timeout" not in dockerfile and "--retries" not in dockerfile
