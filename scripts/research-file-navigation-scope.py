"""Delegate exact file-navigation patches to the native workspace checks."""

import os
from hashlib import sha256
from pathlib import Path
from runpy import run_path

_SCOPE = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
_REVIEWED_BLOBS = {
    "frontend/src/research/ResearchWorkspace.tsx": (
        "da35e863d2950356e2d36a68c17ec55df0d0c4e1",
        "ef8b4ace9815c50d30ef02e270ca1d79d0f210ff",
    ),
    "frontend/src/research/useResearchRegistration.ts": (
        "178b04c0d71c23335edf6339063ce05049f56361",
        "d92abdbfb8f24778e76cfa226fe4e5155ec70bfc",
    ),
    ".github/workflows/workspace-preview-checks.yml": (
        "f1f21ae7863ca060d54c1e10d5ffa406b82bf2a9",
        "f9a5a7e9063544f923e1cd74a962a7bf3d99542f",
    ),
    ".github/workflows/pose-handoff-checks.yml": (
        "763508b8dab8a815ba9af067b8e7e1473a3f0c65",
        "55b88727a239821aac958bebe304534bd01aebb6",
    ),
    ".github/workflows/structure-layout-checks.yml": (
        "1f7314561a28b6a1311738cfd1d6457072cda3ee",
        "3e94e17aada1528a85905e2e1b198bc564bf092e",
    ),
    ".github/workflows/restraint-guidance-checks.yml": (
        "f3bf05164a88d7dd4317206b4f8ca5656717cd0d",
        "67e57ba80690720c8e167f641502f4dd3a815c9b",
    ),
    ".github/workflows/task-layout-checks.yml": (
        "f76b007d7a850ff22c41bbb7dddf2ea772dc93f0",
        "63495b8c3d807a0d9784e6f7f6fb45c0d96ba1c9",
    ),
}
_NAVIGATION = {
    "frontend/src/research/ResearchWorkspace.test.tsx",
    "frontend/src/research/useResearchFileNavigation.ts",
    "frontend/src/research/research-file-navigation.css",
    "server_tests/test_workspace_preview_browser.py",
    "server_tests/test_workspace_versions_browser.py",
}
_DESKTOP_BLOBS = {
    "frontend/src/research/ResearchWorkspaceExpansionExit.tsx": (
        None,
        "c8abd142206ba94d312f5ff5c85237c5d17655ff",
    ),
    "frontend/src/research/ResearchWorkspaceFileToolbar.tsx": (
        None,
        "997c1def9463b23601a531160ddf5d46257044cc",
    ),
    "frontend/src/research/ResearchWorkspace.test.tsx": (
        "1f8d731715777b7d31d3fc9c225e70ad570580e3",
        "dc5a899bc0db020df8e0b26542c3adb607a0901f",
    ),
    "frontend/src/research/ResearchWorkspace.tsx": (
        "c6967f858394254815617030bc87ba5b51e5715d",
        "121bcec0f124a0a69456cd4a6faa3cd39b119d99",
    ),
    "frontend/src/research/research-file-navigation.css": (
        "86fd03960b16b935ed36e60d525838fb84f92709",
        "0011ca8c2b625b9e58713176d6c1ec2ff44678c6",
    ),
    "frontend/src/research/research.css": (
        "20a242f615e62c6885783a82271c9d6277aa97ae",
        "d990fd2786a90627c85d091155c4793abb49e0dc",
    ),
    "server_tests/test_workspace_preview_browser.py": (
        "d7f5e981687b3307fbb26b31cac1094653fbfc80",
        "879cda35f75b258588e947bc91ddc079b4e22190",
    ),
}
_DESKTOP_SELECTOR_SHA = "4c7cf85fc7b9fa6d5afaaa9f024f91e60c37cc369efb49006716e94df588f44a"
_INSPECTION_FILES = {
    ".github/workflows/example-result-set-checks.yml",
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/ketcher-depiction-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/simulation-questionnaire-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/workspace-preview-checks.yml",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/presentation/VerifiedArtifactDownload.test.tsx",
    "frontend/src/presentation/VerifiedArtifactDownload.tsx",
    "frontend/src/research/ObjectInspector.tsx",
    "frontend/src/research/ResearchWorkspaceExpansionExit.tsx",
    "frontend/src/research/SelectedAssetPreview.test.tsx",
    "frontend/src/research/SelectedAssetPreview.tsx",
    "frontend/src/research/asset-file.ts",
    "frontend/src/research/research-file-navigation.css",
    "frontend/src/research/research.css",
    "server_tests/test_workspace_preview_browser.py",
}
_INSPECTION_SHA = "48f2030d6d0d3e275a326d68376a612d7643cbaab2d18c266542c5b782ee5f7a"


def inspection_digest(base, head):
    git = _SCOPE["git"]
    selector = "scripts/research-file-navigation-scope.py"
    mask = f'_INSPECTION_SHA = "{_INSPECTION_SHA}"'.encode()
    payload = git("show", f"{head}:{selector}").replace(mask, b"", 1)
    selector_hash = sha256(payload).hexdigest()
    blob = _SCOPE["git_blob"]
    for path in sorted(_INSPECTION_FILES | {selector}):
        before = blob(base, path)
        after = selector_hash if path == selector else blob(head, path)
        payload += f"\n{path}\t{before}\t{after}".encode()
    return sha256(payload).hexdigest()


def desktop_only(paths, base, support):
    if not _DESKTOP_BLOBS or paths - support != _DESKTOP_BLOBS.keys():
        return False
    blob = _SCOPE["git_blob"]
    if any(
        (blob(base, path), blob("HEAD", path)) != pair
        for path, pair in _DESKTOP_BLOBS.items()
    ):
        return False
    selector = _SCOPE["git"]("show", "HEAD:scripts/research-file-navigation-scope.py")
    # Mask the digest assignment to pin the rest of this selector as well.
    mask = f'_DESKTOP_SELECTOR_SHA = "{_DESKTOP_SELECTOR_SHA}"'.encode()
    return sha256(selector.replace(mask, b"", 1)).hexdigest() == _DESKTOP_SELECTOR_SHA


def file_navigation_only(base, event, ref):
    git = _SCOPE["git"]
    if event == "push" and ref != "main":
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    if event not in {"push", "pull_request"} or not base.strip("0"):
        return False
    paths = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    mirrors = _SCOPE["VERSION_FILES"]
    support = mirrors | {"scripts/research-file-navigation-scope.py"}
    allowed = _NAVIGATION | _REVIEWED_BLOBS.keys() | support
    blob = _SCOPE["git_blob"]
    navigation = (
        bool(paths & _NAVIGATION)
        and paths <= allowed
        and all(
            (blob(base, path), blob("HEAD", path)) == _REVIEWED_BLOBS[path]
            for path in paths & _REVIEWED_BLOBS.keys()
        )
    )
    inspection = (
        paths - support == _INSPECTION_FILES and inspection_digest(base, "HEAD") == _INSPECTION_SHA
    )
    return (inspection or desktop_only(paths, base, support) or navigation) and _SCOPE[
        "only_version_mirrors"
    ](base, paths & mirrors)


if __name__ == "__main__":
    selected = file_navigation_only(
        os.environ.get("BASE", ""),
        os.environ.get("GITHUB_EVENT_NAME", ""),
        os.environ.get("GITHUB_REF_NAME", "main"),
    )
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"file_navigation_only={str(selected).lower()}\n")
