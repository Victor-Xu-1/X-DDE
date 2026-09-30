"""Runs ONLY under the installed official Harness interpreter."""

import json
import sys
from pathlib import Path


def main():
    action, target = sys.argv[1:3]
    if action == "code":
        from opendde_harness.cli.compute_code import prepare_runtime_code

        code = prepare_runtime_code(Path(target))
        print("WORKBENCH_RESULT=" + json.dumps({"code": str(code)}))
    elif action == "image":
        from opendde_harness.cli.compute_environment import (
            check_image_environment,
            load_environment,
        )

        image = json.loads(Path(target).read_text())[0]
        check_image_environment(image, load_environment())
        digests = image.get("RepoDigests", [])
        digest = next(
            (v for v in digests if v.startswith("aurekaresearch/opendde-harness@sha256:")), None
        )
        if not digest:
            raise ValueError("Official image digest was not returned by Docker.")
        print("WORKBENCH_RESULT=" + json.dumps({"image": digest}))
    else:
        raise ValueError("Unknown installer action")


if __name__ == "__main__":
    main()
