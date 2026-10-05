"""CI-only diagnostics for the native installation boundary; never user interface output."""

from opendde_workbench.deployment.installers import install


def install_with_evidence(program, root, operation):
    try:
        return install(program, root, {}, operation, print, lambda: None)
    except (RuntimeError, OSError, ValueError):
        for file in sorted(root.rglob("install.log")):
            print(f"Native installer diagnostic: {file.relative_to(root)}")
            print(file.read_text(errors="replace")[-16000:])
        raise
