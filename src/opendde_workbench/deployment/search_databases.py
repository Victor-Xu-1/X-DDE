"""Run the pinned native archive installer in the managed scientific image."""

import shutil
from pathlib import Path


def install_search(root, work, installed, execute, report, checkpoint):
    from ..resources import resource_inventory

    model_root = root / "models" / "opendde"
    if shutil.disk_usage(root).free < 110 * 1024**3:
        raise ValueError("Search databases require at least 110 GiB free installation space.")
    model_root.mkdir(parents=True, exist_ok=True)
    code = Path(installed["runtime"]["code"])
    tools = Path(installed["opendde-tools"]["directory"])
    if not shutil.which("curl") and not shutil.which("wget"):
        raise RuntimeError("Install system prerequisites with xdde setup system, then retry.")
    checkpoint()
    report("Installing four template/RNA databases; existing files are retained")
    # Archive configuration uses the existing installer process supervisor.
    # Native models still execute in their isolated scientific environments.
    execute(
        [
            "env",
            "PATH=" + str(tools / "bin") + ":/usr/local/bin:/usr/bin:/bin",
            "bash",
            code / "external/opendde/scripts/download_opendde_data.sh",
            "--root",
            model_root,
            "--skip-model",
            "--skip-common",
        ],
        timeout=43200,
    )
    inventory = resource_inventory(model_root)
    if not inventory["templates"] or not inventory["rna"]:
        raise ValueError("The native download did not produce all required search databases.")
    files = {
        path.name: path.stat().st_size for path in (model_root / "search_database").glob("*.fasta")
    }
    return {
        "directory": str(model_root / "search_database"),
        "files": files,
        "source": "OpenDDE native download helper / AlphaFold database archives",
        "verification": "native_archive_decompression_and_file_presence",
    }
