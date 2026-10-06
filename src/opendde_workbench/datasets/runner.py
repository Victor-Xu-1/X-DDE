"""Only the explicitly registered scientific data paths can execute."""

import json
import os
from pathlib import Path


def main():
    request = json.loads(Path("/input/request.json").read_text())
    if os.environ.get("XDDE_PROGRAM") != request["payload"]["kind"]:
        raise ValueError("Data operation differs from the actual native environment.")
    if request["operation"] in {"library_prepare", "library_subset"}:
        from native_library import run

        run(request)
    elif request["payload"]["kind"] == "gnina":
        from native_docking import run

        run(request)
    elif request["payload"]["kind"] == "drugclip":
        from platformnative_io import verify_models

        verify_models()
        if request["operation"] == "drugclip_index":
            from drugclip_index import run
        else:
            from drugclip_retrieval import run
        run(request)
    elif request["payload"]["kind"] == "deli":
        from importlib import import_module

        mode = request["payload"]["mode"]
        if mode in {"validate", "enumerate"}:
            from native_del_library import enumerate_members, validate

            (validate if mode == "validate" else enumerate_members)(request)
        else:
            native = {
                "decode": "decode",
                "count": "count",
                "analyze": "analysis",
                "series": "series",
                "model": "model",
                "candidates": "candidates",
                "followup": "followup",
            }[mode]
            import_module("native_del_" + native).run(request)
    else:
        raise ValueError("The scientific data operation has no reviewed native adapter.")


if __name__ == "__main__":
    main()
