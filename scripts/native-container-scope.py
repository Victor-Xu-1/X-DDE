"""One CI authority for bounded native cancellation and metadata-only changes."""

import ast
import os
import re
import subprocess
from pathlib import Path

RUNTIME = "src/opendde_workbench/integrations/runtime.py"
VERSIONS = {
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}
CI = {
    ".github/workflows/native-container-checks.yml",
    "scripts/native-container-scope.py",
    "tests/test_native_container_scope.py",
}
METADATA_SOURCES = {RUNTIME, "tests/test_runtime_readiness.py"}
METADATA_FILES = METADATA_SOURCES | CI | VERSIONS | {"docs/user-guide.md"}
STOP_SOURCES = {"tests/test_container_stop.py", "server_tests/test_container_stop_native.py"}
STOP_FILES = (
    STOP_SOURCES
    | VERSIONS
    | {
        "src/opendde_workbench/prepared_container.py",
        "src/opendde_workbench/docking/backend.py",
        "src/opendde_workbench/pockets/backend.py",
        "src/opendde_workbench/container_supervision.py",
        ".github/workflows/native-container-checks.yml",
        "docs/user-guide.md",
    }
)


def metadata_surface(source):
    tree = ast.parse(source, type_comments=True)
    functions = [
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "readiness"
    ]
    if len(functions) != 1:
        raise ValueError("Native readiness interface is missing")
    condition = ast.dump(ast.parse('spec["models"]', mode="eval").body)
    blocks = [
        node
        for node in ast.walk(functions[0])
        if isinstance(node, ast.If) and ast.dump(node.test) == condition and not node.orelse
    ]
    if len(blocks) != 1:
        raise ValueError("Native model-resource block is ambiguous")
    approved = ast.parse("await asyncio.to_thread(_check_model_resources, models, spec)").body

    def dump_body(body):
        return ast.dump(ast.Module(body=body, type_ignores=[]))

    inlined = None
    if dump_body(blocks[0].body) == dump_body(approved):
        helpers = [
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_check_model_resources"
        ]
        args = ast.parse("def helper(models, spec): pass").body[0].args
        if (
            len(helpers) != 1
            or ast.dump(helpers[0].args) != ast.dump(args)
            or helpers[0].decorator_list
            or helpers[0].returns
            or getattr(helpers[0], "type_params", [])
        ):
            raise ValueError("Native model-resource helper is not the approved interface")
        inlined = helpers[0]
        # Expand the exact approved offload back to its original statements.
        # Image inspection, label rejection, exception handling and ready-state
        # publication remain in the comparison; no readiness body is erased.
        blocks[0].body = inlined.body
    tree.body = [
        node
        for node in tree.body
        if node is not inlined
        and not (
            isinstance(node, ast.Import)
            and ast.dump(node) == "Import(names=[alias(name='asyncio')])"
        )
    ]
    return ast.dump(tree)


def metadata_only(changed, event="push", *, before=None, after=None):
    paths = set(changed)
    if (
        event not in {"push", "pull_request"}
        or not paths & METADATA_SOURCES
        or not paths <= METADATA_FILES
    ):
        return False
    if RUNTIME not in paths:
        return True
    if before is None or after is None:
        return False
    try:
        return metadata_surface(before) == metadata_surface(after)
    except (SyntaxError, ValueError):
        return False


def stop_only(changed, event="push"):
    paths = set(changed)
    return event in {"push", "pull_request"} and bool(paths & STOP_SOURCES) and paths <= STOP_FILES


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    event = os.environ.get("EVENT", "push")
    base = os.environ.get("BASE", "")
    if (event == "push" and os.environ.get("BRANCH_REF") != "refs/heads/main") or not re.fullmatch(
        "[a-f0-9]{40}", base
    ):
        base = git("merge-base", "HEAD", "origin/main")
    elif subprocess.run(
        ["git", "cat-file", "-e", base + "^{commit}"], stderr=subprocess.DEVNULL
    ).returncode:
        base = git("merge-base", "HEAD", "origin/main")
    changed = git("diff", "--name-only", base, "HEAD").splitlines()
    before = git("show", base + ":" + RUNTIME) if RUNTIME in changed else None
    after = Path(RUNTIME).read_text() if RUNTIME in changed else None
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for name, value in {
            "stop_only": stop_only(changed, event),
            "metadata_only": metadata_only(changed, event, before=before, after=after),
        }.items():
            output.write(f"{name}={str(value).lower()}\n")


if __name__ == "__main__":
    main()
