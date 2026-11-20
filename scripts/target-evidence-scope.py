"""Select the closed target-evidence presentation change, without scientific runs."""

import os
import re
import subprocess
from pathlib import Path
from runpy import run_path

CSS = "frontend/src/discovery/discovery.css"
SOURCES = {
    CSS,
    "frontend/src/discovery/TargetResearchResults.tsx",
    "frontend/src/discovery/TargetResearchResults.test.tsx",
    "frontend/src/discovery/ActivityResults.tsx",
    "frontend/src/discovery/ActivityResults.test.tsx",
    "frontend/src/discovery/ActivityMoleculePreview.tsx",
    "frontend/src/discovery/AssociationResults.tsx",
    "frontend/src/discovery/TargetMaterials.tsx",
    "frontend/src/discovery/ReferenceImportResults.tsx",
    "frontend/src/discovery/target-desktop.css",
    "frontend/src/operations/SequenceSearchResults.tsx",
    "frontend/src/operations/SequenceSearchResults.test.tsx",
    "server_tests/test_target_evidence_browser.py",
    "server_tests/test_target_review_desktop.py",
    "scripts/target-evidence-scope.py",
    "tests/test_target_evidence_scope.py",
}
FILES = SOURCES | {
    ".github/workflows/dataset-discovery-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    "docs/frontend-layout.md",
    "frontend/package-lock.json", "frontend/package.json",
    "install.ps1", "install.sh", "pyproject.toml", "uv.lock",
}
HIDE_PICKER = (
    "html body .studio-app .studio-content:has(> .tool-center.is-result "
    ".target-evidence-results) > .module-task-picker"
)
SELECTORS = {
    ".target-evidence-results",
    ".target-evidence-results .evidence-header",
    ".target-evidence-results .evidence-header > div",
    ".target-evidence-results .evidence-header h3",
    ".target-evidence-results .evidence-header .field-help",
    ".target-evidence-results > .result-summary-grid",
    ".target-evidence-results > .result-summary-grid > div",
    ".target-evidence-results > .result-summary-grid dt",
    ".target-evidence-results > .result-summary-grid dd",
    ".target-evidence-results .activity-molecule-preview .molecule-drawing-style select",
    ".target-evidence-results .activity-molecule-preview .figure-preview-sheet",
    ".target-evidence-results .target-activity-workspace table",
    HIDE_PICKER,
}


def unrelated_css(text):
    """Remove only flat, enumerated result-owned rules; preserve shared CSS."""
    def retain(match):
        selector = " ".join(match.group(1).split())
        return "" if selector in SELECTORS else match.group(0)

    remaining = re.sub(r"([^{}]+)\{[^{}]*\}", retain, text)
    return "\n".join(line.rstrip() for line in remaining.splitlines() if line.strip())


def selected(changed, event="push", *, css_safe=False):
    paths = set(changed)
    return (
        event in {"push", "pull_request"}
        and bool(paths & SOURCES)
        and paths <= FILES
        and (CSS not in paths or css_safe)
    )


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    base = os.environ.get("BASE", "")
    event = os.environ.get("GITHUB_EVENT_NAME", "push")
    if event in {"push", "pull_request"} and os.environ.get("GITHUB_REF_NAME") != "main":
        base = git("merge-base", "origin/main", "HEAD")
    paths = (
        git("diff", "--name-only", base, "HEAD").splitlines()
        if base and set(base) != {"0"} else []
    )
    safe = CSS not in paths or unrelated_css(git("show", f"{base}:{CSS}")) == unrelated_css(
        Path(CSS).read_text()
    )
    only = selected(paths, event, css_safe=safe)
    if event in {"push", "pull_request"} and set(paths) & SOURCES and not only:
        utility = run_path(str(Path(__file__).with_name("molecular-utility-scope.py")))
        if not utility["followup_selected"](set(paths), event, base):
            raise SystemExit(
                "Mixed target-evidence/shared changes require an explicit scoped check plan; "
                "unrelated dataset and native DEL jobs were not started."
            )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"target_evidence_only={str(only).lower()}\n")


if __name__ == "__main__":
    main()
