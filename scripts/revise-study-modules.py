"""Author targeted example successors while retaining exact published snapshots."""

import argparse
import importlib
import json

from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue_profiles import compatible_modules
from opendde_workbench.examples.stat6 import catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--set", action="append", default=[], metavar="CAPABILITY=REVISION")
    args = parser.parse_args()
    path = catalogue.ROOT / "catalogue-profiles.json"
    revisions = catalogue.ROOT / "module-revisions.json"
    profiles = json.loads(path.read_text())
    current = bundle_catalogue("stat6")
    if current.digest not in profiles:
        raise ValueError("Register and verify the current authored catalogue before changing it.")
    changes = {}
    for item in args.set:
        key, value = item.split("=", 1)
        if key in changes or key not in current.modules or not value.isdecimal():
            raise ValueError("Choose distinct existing modules and numeric successor revisions.")
        revision = int(value)
        if revision != current.modules[key].revision + 1:
            raise ValueError("Each authored module successor advances exactly one revision.")
        changes[key] = revision
    saved = {file: file.read_bytes() for file in (path, revisions)}
    try:
        if changes:
            for profile in profiles.values():
                frozen = profile.setdefault("module_overrides", {})
                for key in changes.keys() & set(profile["module_ids"]):
                    frozen.setdefault(key, current.modules[key].model_dump(mode="json"))
            values = json.loads(revisions.read_text())
            values.update(changes)
            revisions.write_text(json.dumps(values, indent=2, sort_keys=True) + "\n")
            importlib.reload(catalogue)
            updated = bundle_catalogue("stat6")
            profiles[updated.digest] = {
                "file_keys": list(catalogue.MANIFEST["files"]),
                "module_ids": list(updated.modules),
            }
            path.write_text(json.dumps(profiles, indent=2, ensure_ascii=False) + "\n")
        for digest in profiles:
            compatible_modules(digest, profile="stat6")
    except Exception:
        for file, original in saved.items():
            file.write_bytes(original)
        importlib.reload(catalogue)
        raise
    print(
        json.dumps(
            {
                "catalogue": bundle_catalogue("stat6").digest,
                "published_profiles_verified": len(profiles),
                "changed_modules": changes,
            }
        )
    )


if __name__ == "__main__":
    main()
