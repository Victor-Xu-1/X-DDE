"""Run the real case-bundle selector with a bounded, runner-like command PATH."""

import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/case-bundle-checks.yml"


def selector_script():
    lines = WORKFLOW.read_text().splitlines()
    start = lines.index("      - name: Select checks for affected consumers")
    start = lines.index("        run: |", start) + 1
    end = start
    while end < len(lines) and lines[end].startswith("          "):
        end += 1
    return textwrap.dedent("\n".join(lines[start:end]))


class CaseBundleScopeTests(unittest.TestCase):
    def run_selector(
        self, paths="", *, event="push", base_status=0, diff_status=0, grep_status=None
    ):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = root / "bin"
            commands.mkdir()
            git = commands / "git"
            git.write_text(
                f"#!{sys.executable}\n"
                + textwrap.dedent("""\
                import os, sys
                from pathlib import Path
                if sys.argv[1:] == ['cat-file', '-e', 'base^{commit}']:
                    sys.exit(int(os.environ['BASE_STATUS']))
                if sys.argv[1:] == ['diff', '--name-only', 'base', 'head']:
                    sys.stdout.write(Path(os.environ['PATHS_FILE']).read_text())
                    sys.exit(int(os.environ['DIFF_STATUS']))
                sys.exit(99)
                """)
            )
            git.chmod(0o755)
            grep = commands / "grep"
            if grep_status is None:
                grep.symlink_to(shutil.which("grep"))
            else:
                grep.write_text(f"#!{sys.executable}\nraise SystemExit({grep_status})\n")
                grep.chmod(0o755)
            paths_file = root / "paths"
            paths_file.write_text(paths)
            output = root / "output"
            result = subprocess.run(
                ["/bin/bash", "-e", "-o", "pipefail", "-c", selector_script()],
                env={
                    **os.environ,
                    "PATH": str(commands),
                    "BASE": "base",
                    "HEAD": "head",
                    "EVENT": event,
                    "GITHUB_OUTPUT": str(output),
                    "BASE_STATUS": str(base_status),
                    "DIFF_STATUS": str(diff_status),
                    "PATHS_FILE": str(paths_file),
                },
                text=True,
                capture_output=True,
                timeout=10,
            )
            return result, output.read_text() if output.exists() else ""

    def test_affected_paths_without_ripgrep(self):
        for path in (
            "src/opendde_workbench/deployment/manager.py",
            "src/opendde_workbench/deployment/installers.py",
            "src/opendde_workbench/settings.py",
            "frontend/src/deployment/catalog.ts",
            "frontend/src/deployment/component-groups.ts",
        ):
            with self.subTest(path=path):
                result, output = self.run_selector(path + "\n")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output, "deployment=true\n")

    def test_unrelated_and_empty_changes(self):
        for paths in ("", "docs/development.md\ntests/test_case_bundle.py\n"):
            with self.subTest(paths=paths):
                result, output = self.run_selector(paths)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output, "deployment=false\n")

    def test_manual_dispatch_selects_consumers_without_diff(self):
        result, output = self.run_selector(event="workflow_dispatch", diff_status=128)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, "deployment=true\n")

    def test_unavailable_base_selects_consumers_without_diff(self):
        result, output = self.run_selector(base_status=128, diff_status=128)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, "deployment=true\n")

    def test_diff_failure_does_not_declare_no_consumers(self):
        result, output = self.run_selector(diff_status=128)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output, "")

    def test_matcher_failure_does_not_declare_no_consumers(self):
        for status in (2, 127):
            with self.subTest(status=status):
                result, output = self.run_selector(grep_status=status)
                self.assertEqual(result.returncode, status)
                self.assertEqual(output, "")

    def test_large_change_list_with_early_match(self):
        paths = "frontend/src/deployment/catalog.ts\n" + "docs/unrelated.md\n" * 10000
        result, output = self.run_selector(paths)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, "deployment=true\n")


if __name__ == "__main__":
    unittest.main()
