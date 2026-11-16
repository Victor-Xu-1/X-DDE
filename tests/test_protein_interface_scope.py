import runpy
from pathlib import Path

scope = runpy.run_path(Path(__file__).parents[1] / "scripts/protein-interface-scope.py")


def test_confidence_merge_and_interface_presentation_do_not_start_native_science():
    # A main merge includes all feature commits, not just the latest UI fix.
    changed = [
        "src/opendde_workbench/integrations/native_boltz.py",
        "src/opendde_workbench/integrations/boltz_result.py",
        "src/opendde_workbench/integrations/result.py",
        "src/opendde_workbench/boltz_confidence.py",
        "frontend/src/viewer/scene.ts",
        ".github/workflows/protein-interface-checks.yml",
        "scripts/protein-interface-scope.py",
    ]
    assert not scope["native_changed"](changed)
    assert not scope["native_changed"]([])


def test_actual_native_interface_changes_still_require_their_native_check():
    for name in (
        "src/opendde_workbench/integrations/protein_interface.py",
        "src/opendde_workbench/integrations/protein_interface_result.py",
        "src/opendde_workbench/integrations/plip_contacts.py",
        "server_tests/test_native_protein_interface.py",
    ):
        assert scope["native_changed"](["frontend/src/viewer/scene.ts", name])


def test_first_branch_push_selects_actual_scientific_changes_not_branch_creation():
    first_push = {"before": "0" * 40}
    presentation = ["frontend/src/integrations/ProteinInterfaceResults.tsx"]
    assert not scope["native_mode"]("push", first_push, presentation)
    assert scope["native_mode"]("push", first_push, [
        *presentation, "src/opendde_workbench/integrations/protein_interface_result.py",
    ])
    assert not scope["native_mode"]("workflow_dispatch", {}, presentation)
    assert scope["native_mode"]("workflow_dispatch", {"inputs": {"native": True}}, [])
