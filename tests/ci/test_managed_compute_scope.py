"""An exact constructor-policy edit may use its gate; other API behavior never may."""

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "managed_compute_scope",
    Path(__file__).resolve().parents[2] / "scripts/managed_compute_scope.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
BEFORE = """from .deployment.manager import DeploymentManager
def create_app(settings):
    deployments = DeploymentManager(settings.state_dir, msa_url=settings.msa_url)
    return deployments
"""
AFTER = """from .deployment.manager import DeploymentManager
from .opendde_limits import OpenDDELimits
def create_app(settings):
    deployments = DeploymentManager(settings.state_dir, msa_url=settings.msa_url,
        resource_limits=OpenDDELimits.configured(settings))
    return deployments
"""


class ManagedComputeScopeTests(unittest.TestCase):
    def test_exact_operator_policy_wiring_has_its_direct_gate(self):
        self.assertTrue(MODULE.selected([MODULE.CORE, MODULE.API], BEFORE, AFTER))
        self.assertTrue(MODULE.selected([MODULE.CORE]))

    def test_unrelated_api_behavior_never_skips_existing_gates(self):
        for content in (
            AFTER.replace("return deployments", "return None"),
            AFTER.replace("configured(settings)", "configured(other)"),
            AFTER + "\ndef different_route(): return True\n",
        ):
            with self.subTest(content=content):
                self.assertFalse(MODULE.selected([MODULE.CORE, MODULE.API], BEFORE, content))

    def test_other_modules_or_unreadable_comparison_are_not_selected(self):
        self.assertFalse(MODULE.selected([]))
        self.assertFalse(MODULE.selected([MODULE.CORE, MODULE.API]))
        self.assertFalse(MODULE.selected([MODULE.API], BEFORE, AFTER))
        self.assertFalse(MODULE.selected([MODULE.CORE, "src/opendde_workbench/assets.py"]))
        self.assertFalse(MODULE.selected([MODULE.CORE, "frontend/src/docking/DockingForm.tsx"]))

    def test_only_the_exact_cleanup_status_field_can_use_the_resource_gate(self):
        before = "interface Deployment {\n  compute_service?: {\n    ready: boolean;\n  };\n}\n"
        after = before.replace(
            "  compute_service?: {\n", "  compute_service?: {\n    cleanup_pending?: boolean;\n"
        )
        changed = [MODULE.CORE, MODULE.CLIENT]
        self.assertTrue(MODULE.selected(changed, before_client=before, after_client=after))
        self.assertFalse(MODULE.selected(changed))
        self.assertFalse(
            MODULE.selected(
                changed,
                before_client=before,
                after_client=after.replace("ready: boolean", "ready: string"),
            )
        )


if __name__ == "__main__":
    unittest.main()
