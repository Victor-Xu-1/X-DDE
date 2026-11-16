"""Select native interface verification only for its actual scientific sources."""

import fnmatch
import json
import os
import subprocess


def native_changed(changed):
    return any(
        fnmatch.fnmatchcase(name, "src/opendde_workbench/integrations/*interface*")
        or name
        in {
            "src/opendde_workbench/integrations/plip_contacts.py",
            "server_tests/test_native_protein_interface.py",
        }
        for name in changed
    )


def native_mode(event_name, event, changed):
    if event_name == "workflow_dispatch":
        return str(event.get("inputs", {}).get("native", "false")).lower() == "true"
    return native_changed(changed)


def main():
    with open(os.environ["GITHUB_EVENT_PATH"]) as stream:
        event = json.load(stream)
    event_name = os.environ["GITHUB_EVENT_NAME"]
    changed = []
    if event_name != "workflow_dispatch":
        base = event.get("before")
        if not base or set(base) == {"0"}:
            # A new branch has no previous push. Compare its actual work with main.
            base = subprocess.check_output(
                ["git", "merge-base", "origin/main", "HEAD"], text=True
            ).strip()
        elif subprocess.run(
            ["git", "cat-file", "-e", base + "^{commit}"], capture_output=True
        ).returncode:
            subprocess.run(["git", "fetch", "--no-tags", "--depth=1", "origin", base], check=True)
        changed = subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
    native = native_mode(event_name, event, changed)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("native=" + str(native).lower() + "\n")


if __name__ == "__main__":
    main()
