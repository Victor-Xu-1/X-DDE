"""Route the reviewed catalogue layout and its direct consumers to the component gate."""

import os
from hashlib import sha256
from pathlib import Path
from runpy import run_path

scope = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_WORKFLOW = ".github/workflows/case-bundle-checks.yml"
_INSTALLATION = ".github/workflows/installation-checks.yml"
_SCRIPT = "scripts/component-presentation-scope.py"
_FILES = {
    _INSTALLATION,
    _SCRIPT,
    "frontend/src/deployment/ComponentCard.tsx",
    "frontend/src/deployment/ComponentLibrary.test.tsx",
    "frontend/src/deployment/ComponentLibrary.tsx",
    "frontend/src/deployment/components.css",
    "frontend/src/deployment/deployment.test.tsx",
    "server_tests/test_component_layout_browser.py",
    "server_tests/test_component_presentation_browser.py",
}
_WORKFLOW_BLOBS = ("cdf54ad96c5420fb63b046e670e105855ed79e3b", "cdf54ad96c5420fb63b046e670e105855ed79e3b")
_INSTALLATION_BLOBS = ("6a8ba5d380064d0b93696709b61ed198238b0743", "96fd8880a879d15ca48e5715fa5795d3a23f1f6d")
_SELECTOR_SHA = "69567429a39387931226c55feeeca3857035e4b6f59cbbd9e73ffb729dc46b23"


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
    if (blob(base, _INSTALLATION), blob("HEAD", _INSTALLATION)) != _INSTALLATION_BLOBS:
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
