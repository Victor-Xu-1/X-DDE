"""Closed native metadata delegation must preserve non-metadata lifecycle gates."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "native_scope", Path(__file__).parents[1] / "scripts/native-container-scope.py"
)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)
BEFORE = """import json
async def readiness(settings, identifier):
    return {"ready": False}
def configuration(settings, identifier):
    return "immutable-image"
"""
AFTER = (
    BEFORE.replace("import json", "import asyncio\nimport json").replace(
        'return {"ready": False}',
        "return await asyncio.to_thread(_check_model_resources, settings)",
    )
    + '\ndef _check_model_resources(settings):\n    return {"ready": True}\n'
)


def test_metadata_selection_accepts_its_exact_sources_and_browser_independent_contracts():
    assert scope.metadata_only(["tests/test_runtime_readiness.py"])
    assert scope.metadata_only([scope.RUNTIME], before=BEFORE, after=AFTER)
    assert scope.metadata_only(scope.METADATA_FILES, "pull_request", before=BEFORE, after=AFTER)
    assert not scope.metadata_only(
        scope.METADATA_FILES, "workflow_dispatch", before=BEFORE, after=AFTER
    )
    assert not scope.metadata_only([scope.RUNTIME])
    assert not scope.metadata_only(scope.CI)
    for path in [
        "src/opendde_workbench/api.py",
        "src/opendde_workbench/integrations/native_resources.py",
        "src/opendde_workbench/container_runtime.py",
        "frontend/src/App.tsx",
    ]:
        assert not scope.metadata_only([scope.RUNTIME, path], before=BEFORE, after=AFTER)


def test_metadata_delegation_cannot_hide_image_identity_or_native_execution_changes():
    for after in [
        AFTER.replace('return "immutable-image"', 'return "different-image"'),
        AFTER.replace(
            "readiness(settings, identifier)", "readiness(settings, identifier, unchecked=True)"
        ),
        AFTER + "\ndef start():\n    return True\n",
        AFTER.replace("import json", "import os\nimport json"),
        "not valid python: !",
    ]:
        assert not scope.metadata_only([scope.RUNTIME], before=BEFORE, after=after)


def test_existing_cancellation_scope_remains_closed():
    assert scope.stop_only(scope.STOP_FILES)
    assert not scope.stop_only(scope.STOP_FILES, "workflow_dispatch")
    assert not scope.stop_only(scope.STOP_FILES | {scope.RUNTIME})
    assert not scope.stop_only(["docs/user-guide.md"])


def test_workflow_runs_metadata_validation_without_installing_or_executing_science():
    workflow = (
        Path(__file__).parents[1] / ".github/workflows/native-container-checks.yml"
    ).read_text()
    selected = workflow.split("  model-readiness:", 1)[1].split("  cancellation:", 1)[0]
    assert "metadata_only == 'true'" in selected
    assert "tests/test_runtime_readiness.py" in selected
    assert "tests/test_readiness_cache.py" in selected
    assert "docker" not in selected and "native_cleanup_probe" not in selected
    lifecycle = workflow.split("  lifecycle:", 1)[1].split("    runs-on:", 1)[0]
    assert "metadata_only != 'true'" in lifecycle
