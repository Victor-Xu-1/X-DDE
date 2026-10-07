"""Fixed release recipes; all paths stay inside the owned deployment root."""

import shutil
import sys
from uuid import uuid4

from .catalog import PACKAGES
from .diffsbdd_install import install_model, install_runtime
from .docking_install import install_docking
from .paths import environment_root
from .pocket_install import install_pockets
from .process import run
from .provisioners import OPEN_PACKAGES, OPENDDE, provisioning_origin
from .transfers import download, extract

CONSTRAINTS = "https://github.com/aurekaresearch/OpenDDE-Harness/releases/download/v0.0.4/opendde-harness-constraints.txt"
CONSTRAINTS_SHA = "2659c7b3fc403f165799f3ed9b66b2cd7d9bd2b18b6982c38a86e8f8e74b509b"


def install(key, root, installed, operation, report, checkpoint, *, state=None):
    spec = PACKAGES[key]
    work = root / "operations" / operation
    work.mkdir(parents=True, exist_ok=True)

    def execute(args, timeout=3600):
        checkpoint()
        return run([str(v) for v in args], work, checkpoint, report, timeout=timeout)

    metadata = {"version": spec.version, "provisioning": provisioning_origin(key, operation)}
    report("Preparing verified release")
    from ..integrations.specs import PROGRAMS
    from .scientific_install import install_models as scientific_models
    from .scientific_install import install_runtime as scientific_runtime

    if key in PROGRAMS:
        metadata.update(scientific_runtime(key, root, work, execute, report, checkpoint))
    elif key.endswith("-models") and key.removesuffix("-models") in PROGRAMS:
        metadata.update(scientific_models(key.removesuffix("-models"), root, report, checkpoint))
    elif key == "supplier-libraries":
        from .supplier_files import install as supplier_files

        metadata.update(supplier_files(root, state, report, checkpoint))
    elif key == "public-experimental-examples":
        from .experimental_cases import install as experimental_cases

        metadata.update(experimental_cases(root, state, report, checkpoint))
    elif key in {
        "public-examples",
        "public-dataset-examples",
        "public-surface-examples",
        "public-pose-examples",
    }:
        from ..examples.bundle import restore_bundle
        from ..settings import Settings

        if state is None:
            raise ValueError("Public cases require the current X-DDE scientific state directory.")
        archive = root / "downloads" / spec.url.rsplit("/", 1)[1]
        download(spec.url, archive, spec.checksum, report, checkpoint)
        report("Verifying and restoring fixed public scientific results")
        settings = Settings(
            state_dir=state,
            image_file=state / "managed-references/image",
            code_file=state / "managed-references/code",
            model_dir=root / "models/opendde",
            cache_dir=state / "cache",
        )
        metadata.update(restore_bundle(archive, settings, spec.checksum, checkpoint))
        metadata["bundle_sha256"] = spec.checksum
    elif key == "opendde-tools":
        from .native_tools import install_tools

        metadata.update(install_tools(root, work, installed, execute, report, checkpoint))
    elif key == "opendde-search":
        from .search_databases import install_search

        metadata.update(install_search(root, work, installed, execute, report, checkpoint))
    elif key == "sapiens":
        from .humanization_install import install_humanization

        metadata.update(install_humanization(root, work, execute, report, checkpoint))
    elif key == "admet":
        from .admet_install import install_admet

        metadata.update(install_admet(root, work, execute, report, checkpoint))
    elif key == "posebusters":
        from .quality_install import install_quality

        metadata.update(install_quality(root, work, execute, report, checkpoint))
    elif key == "anarcii":
        from .antibody_install import install_antibody

        metadata.update(install_antibody(root, work, execute, report, checkpoint))
    elif key == "caver":
        from .space_install import install_space

        metadata.update(install_space(root, work, execute, report, checkpoint))
    elif key == "biopython":
        from .receptor_install import install_biopython

        metadata.update(install_biopython(root, work, execute, report, checkpoint))
    elif key == "chemistry":
        from .chemistry_install import install_chemistry

        metadata.update(install_chemistry(root, work, execute, report, checkpoint))
    elif key == "gnina":
        metadata.update(install_docking(root, work, execute, report, checkpoint))
    elif key in {"p2rank", "p2rank-compute"}:
        metadata.update(install_pockets(key, root, work, execute, report, checkpoint))
    elif key == "diffsbdd":
        metadata.update(install_runtime(root, work, report, checkpoint))
    elif key.startswith("diffsbdd-model-"):
        metadata.update(install_model(key, root, installed, report, checkpoint))
    elif key in {"ketcher", "molstar", "harness"}:
        archive = root / "downloads" / spec.url.rsplit("/", 1)[1]
        download(spec.url, archive, spec.checksum, report, checkpoint)
        # Each attempt has a separate staging area, never overwrites an active release.
        parent = environment_root(root) if key == "harness" else root / "packages" / key
        destination = parent / (spec.version + "-" + str(uuid4()))
        destination.mkdir(parents=True)
        metadata["directory"] = str(destination)
        if key == "harness":
            constraints = root / "downloads" / "harness-constraints-0.0.4.txt"
            download(CONSTRAINTS, constraints, CONSTRAINTS_SHA, report, checkpoint)
            uv = shutil.which("uv")
            if not uv:
                raise RuntimeError(
                    "uv is missing. Re-run the Workbench installer to install its prerequisites."
                )
            report("Installing native Harness in an isolated environment")
            execute([uv, "venv", "--python", sys.executable, destination / "venv"])
            python = destination / "venv/bin/python"
            execute(
                [
                    uv,
                    "pip",
                    "install",
                    "--link-mode",
                    "copy",
                    "--python",
                    python,
                    "--constraint",
                    constraints,
                    archive,
                ]
            )
            execute([python, "-c", "import opendde_harness.cli.commands"])
            metadata["python"] = str(python)
        else:
            report("Extracting and verifying editor files")
            extract(archive, destination, checkpoint)
            if key == "molstar":
                web = destination / "package/build/viewer"
                required = [web / "molstar.js", web / "molstar.css"]
            else:
                candidates = [
                    p.parent
                    for p in destination.rglob("index.html")
                    if "node_modules" not in p.parts
                ]
                if len(candidates) != 1:
                    raise RuntimeError("Unexpected Ketcher distribution layout.")
                web = candidates[0]
                required = [web / "index.html"]
            if not all(p.is_file() for p in required):
                raise RuntimeError("Editor distribution is incomplete.")
            metadata["web"] = str(web)
    elif key in OPEN_PACKAGES:
        metadata.update(OPENDDE.prepare(key, root, work, installed, execute, report))
    else:
        raise ValueError("Unknown installer recipe")
    checkpoint()
    return metadata
