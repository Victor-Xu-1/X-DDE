"""Select the exact managed-compute boundary; unrelated API edits retain their gates."""

import ast
import fnmatch
import os
import subprocess
from pathlib import Path

API = "src/opendde_workbench/api.py"
CORE = "src/opendde_workbench/deployment/native_compute_service.py"
PATTERNS = (
    API,
    CORE,
    "src/opendde_workbench/deployment/native_compute_limits.py",
    "src/opendde_workbench/deployment/compute_service.py",
    "src/opendde_workbench/deployment/manager.py",
    "src/opendde_workbench/opendde_limits.py",
    "src/opendde_workbench/harness_admission.py",
    "src/opendde_workbench/harness_process.py",
    "src/opendde_workbench/harness_service.py",
    "tests/test_compute_limits.py",
    "tests/test_harness_admission.py",
    "tests/test_compute_service.py",
    "tests/test_compute_msa_protocol.py",
    "tests/test_deployment.py",
    "server_tests/test_managed_compute_limits.py",
    "scripts/managed_compute_scope.py",
    "tests/ci/test_managed_compute_scope.py",
    ".github/workflows/managed-compute-checks.yml",
    ".github/workflows/case-bundle-checks.yml",
    ".github/workflows/task-action-checks.yml",
    ".github/workflows/task-readiness-checks.yml",
    ".github/workflows/harness-checks.yml",
    "docs/design/README.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def api_wiring_only(before, after):
    old, current = ast.parse(before), ast.parse(after)

    def dump(value):
        return ast.dump(value, include_attributes=False)

    if dump(old) == dump(current):
        return True
    imports, arguments = 0, 0
    for node in list(current.body):
        if (
            isinstance(node, ast.ImportFrom)
            and node.level == 1
            and node.module == "opendde_limits"
            and len(node.names) == 1
            and node.names[0].name == "OpenDDELimits"
            and node.names[0].asname is None
        ):
            current.body.remove(node)
            imports += 1
    expected = dump(ast.parse("OpenDDELimits.configured(settings)", mode="eval").body)
    for node in ast.walk(current):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "DeploymentManager"
        ):
            for argument in list(node.keywords):
                if argument.arg == "resource_limits" and dump(argument.value) == expected:
                    node.keywords.remove(argument)
                    arguments += 1
    return imports == arguments == 1 and dump(old) == dump(current)


def candidates(changed):
    return CORE in changed and all(
        any(fnmatch.fnmatchcase(name, pattern) for pattern in PATTERNS) for name in changed
    )


def selected(changed, before_api=None, after_api=None):
    if not candidates(changed):
        return False
    return API not in changed or (
        before_api is not None and after_api is not None and api_wiring_only(before_api, after_api)
    )


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = (
        subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
        if base and set(base) != {"0"}
        else []
    )
    before = after = None
    if candidates(changed) and API in changed:
        before = subprocess.check_output(["git", "show", base + ":" + API], text=True)
        after = Path(API).read_text(encoding="utf-8")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write("managed_compute_only=" + str(selected(changed, before, after)).lower() + "\n")


if __name__ == "__main__":
    main()
