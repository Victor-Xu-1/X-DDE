"""Reuse only complete local images with current source, dependency and composer identities."""

import json
import re

from ..integrations.image import lock_digest
from ..integrations.image_identity import composer_digest
from ..integrations.specs import recipe_digest


def cached_image(identifier, execute, report):
    tag = "xdde-" + identifier + ":" + recipe_digest(identifier)[:16]
    identities = (
        execute(
            [
                "docker",
                "image",
                "ls",
                "--no-trunc",
                "--filter",
                "reference=" + tag,
                "--format",
                "{{.ID}}",
            ]
        )
        .strip()
        .splitlines()
    )
    if not identities:
        return None
    if len(set(identities)) != 1 or not re.fullmatch(r"sha256:[a-f0-9]{64}", identities[0]):
        raise ValueError("The cached native image has an invalid immutable identity.")
    values = json.loads(execute(["docker", "image", "inspect", identities[0]]))
    if not isinstance(values, list) or len(values) != 1 or values[0].get("Id") != identities[0]:
        raise ValueError("The cached native image inspection does not match its identity.")
    image = values[0]
    labels = image.get("Config", {}).get("Labels") or {}
    expected = {
        "org.xdde.science.program": identifier,
        "org.xdde.science.recipe": recipe_digest(identifier),
        "org.xdde.science.lock": lock_digest(identifier),
        "org.xdde.science.composer": composer_digest(),
    }
    if any(labels.get(key) != value for key, value in expected.items()):
        report(
            "Previous native image differs from the reviewed build; building from locked sources"
        )
        return None
    platform = execute(["docker", "version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"]).strip()
    if platform != image.get("Os", "") + "/" + image.get("Architecture", ""):
        report("Cached native image is for another platform; building for this engine")
        return None
    return identities[0]
