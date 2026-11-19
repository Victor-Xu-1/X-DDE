"""Keep the reviewed catalogue CSS transition on the component presentation gate."""

import os
from hashlib import sha256
from pathlib import Path
from runpy import run_path

scope = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_WORKFLOW = ".github/workflows/case-bundle-checks.yml"
_SCRIPT = "scripts/component-presentation-scope.py"
_FILES = {
    _WORKFLOW,
    _SCRIPT,
    "frontend/src/deployment/components.css",
    "server_tests/test_component_presentation_browser.py",
}
_WORKFLOW_BLOBS = ("e1eb6477c1b18dc149fa4a9a8d27df8a68a61cab", "cdf54ad96c5420fb63b046e670e105855ed79e3b")
_SELECTOR_SHA = "c5cfb398bced56e575e3a8e606c3dc54316113f5eba3aa75b9e3a92e9e58d6f2"


def presentation_only(base, event, ref):
    git = scope["git"]
    if event == "push" and ref != "main":
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    if event not in {"push", "pull_request"} or not base.strip("0"):
        return False
    paths = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    mirrors = scope["VERSION_FILES"]
    if paths - mirrors != _FILES:
        return False
    blob = scope["git_blob"]
    if (blob(base, _WORKFLOW), blob("HEAD", _WORKFLOW)) != _WORKFLOW_BLOBS:
        return False
    source = git("show", f"HEAD:{_SCRIPT}")
    mask = f'_SELECTOR_SHA = "{_SELECTOR_SHA}"'.encode()
    return (
        sha256(source.replace(mask, b"", 1)).hexdigest() == _SELECTOR_SHA
        and scope["only_version_mirrors"](base, paths & mirrors)
    )


if __name__ == "__main__":
    selected = presentation_only(
        os.environ.get("BASE", ""),
        os.environ.get("GITHUB_EVENT_NAME", ""),
        os.environ.get("GITHUB_REF_NAME", "main"),
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"component_presentation_only={str(selected).lower()}\n")
