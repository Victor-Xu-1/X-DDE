"""Keep appearance-only work on palette, persistence and rendered appearance checks."""

import ast
import os
import re
import subprocess

SOURCES = {
    "frontend/src/theme.ts",
    "frontend/src/theme.test.ts",
    "frontend/src/theme.warm.test.ts",
    "frontend/public/theme-init.js",
    "frontend/src/tokens.css",
    "frontend/src/studio/InterfaceSettings.tsx",
    "frontend/src/studio/InterfaceSettings.test.tsx",
    "frontend/src/design/preferences.css",
    "frontend/src/design/theme-preferences.css",
    "server_tests/test_appearance_browser.py",
}
FILES = SOURCES | {
    "frontend/src/design/workspaces.css",
    "server_tests/test_navigation_shell_browser.py",
    ".github/workflows/appearance-checks.yml",
    ".github/workflows/navigation-shell-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    "scripts/appearance-scope.py",
    "tests/test_appearance_scope.py",
    "docs/frontend-layout.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}
WORKSPACES = "frontend/src/design/workspaces.css"
PREFERENCES = "frontend/src/design/preferences.css"
NAVIGATION = "server_tests/test_navigation_shell_browser.py"
CLEANUPS = {
    (
        "@media (max-width: 640px) {\n  .theme-option > small {\n    grid-column: 2;\n  }\n"
        "  .theme-option > .theme-swatch {\n    grid-row: 1 / span 2;\n  }\n}\n"
    ): "",
    "  .model-grid,\n  .theme-options {": "  .model-grid {",
    (
        "  .theme-option {\n    display: grid;\n    grid-template-columns: 70px 1fr;\n"
        "    align-items: center;\n    min-height: 0;\n  }\n"
    ): "",
    "  .theme-swatch {\n    height: 45px;\n  }\n": "",
}


def workspace_cleanup_only(before, after):
    if not isinstance(before, str) or not isinstance(after, str):
        return False
    for source, replacement in CLEANUPS.items():
        if before.count(source) != 1:
            return False
        before = before.replace(source, replacement)
    return re.sub(r"\s+", " ", before).strip() == re.sub(r"\s+", " ", after).strip()


def preferences_cleanup_only(before, after):
    if not isinstance(before, str) or not isinstance(after, str):
        return False
    try:
        prefix = before[: before.index(".theme-options {")]
        start = before.index('.studio-app .studio-topbar .global-search input[type="search"] {')
        end = before.index(".theme-option > input {", start)
        warning = before[before.index(".preference-warning {") :]
    except ValueError:
        return False
    expected = prefix + before[start:end] + warning
    return re.sub(r"\s+", " ", expected).strip() == re.sub(r"\s+", " ", after).strip()


def navigation_theme_labels_only(before, after):
    if not isinstance(before, str) or not isinstance(after, str):
        return False
    try:
        previous, current = ast.parse(before), ast.parse(after)
    except SyntaxError:
        return False

    class ThemeLabels(ast.NodeTransformer):
        def visit_Constant(self, node):
            labels = {"深色": "夜间黑色", "Dark": "Night black", "浅色": "暖色", "Light": "Warm"}
            if isinstance(node.value, str) and node.value in labels:
                return ast.copy_location(ast.Constant(labels[node.value]), node)
            return node

    return ast.dump(ThemeLabels().visit(previous)) == ast.dump(current)


def selected(
    changed,
    event="push",
    before=None,
    after=None,
    pref_before=None,
    pref_after=None,
    nav_before=None,
    nav_after=None,
):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and bool(changed & SOURCES)
        and changed <= FILES
        and (WORKSPACES not in changed or workspace_cleanup_only(before, after))
        and (PREFERENCES not in changed or preferences_cleanup_only(pref_before, pref_after))
        and (NAVIGATION not in changed or navigation_theme_labels_only(nav_before, nav_after))
    )


def from_git(changed, base, event="push"):
    before = after = None
    pref_before = pref_after = None
    nav_before = nav_after = None
    try:
        if WORKSPACES in changed:
            before = subprocess.check_output(["git", "show", f"{base}:{WORKSPACES}"], text=True)
            after = subprocess.check_output(["git", "show", f"HEAD:{WORKSPACES}"], text=True)
        if PREFERENCES in changed:
            pref_before = subprocess.check_output(
                ["git", "show", f"{base}:{PREFERENCES}"], text=True
            )
            pref_after = subprocess.check_output(["git", "show", f"HEAD:{PREFERENCES}"], text=True)
        if NAVIGATION in changed:
            nav_before = subprocess.check_output(["git", "show", f"{base}:{NAVIGATION}"], text=True)
            nav_after = subprocess.check_output(["git", "show", f"HEAD:{NAVIGATION}"], text=True)
    except subprocess.CalledProcessError:
        return False
    return selected(changed, event, before, after, pref_before, pref_after, nav_before, nav_after)


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
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        stream.write(
            "appearance_only="
            + str(from_git(changed, base, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
