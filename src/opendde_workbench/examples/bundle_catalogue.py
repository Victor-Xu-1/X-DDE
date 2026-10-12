"""Resolve portable evidence against the existing immutable study catalogues."""

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from . import catalogue
from .contracts import CaseStudy, ModuleExample, SourceFile


@dataclass(frozen=True)
class BundleCatalogue:
    profile: str
    modules: Mapping[str, ModuleExample]
    cases: Mapping[str, CaseStudy]
    files: Mapping[str, SourceFile]
    digest: str

    def prepare(self, capability, scientific, cache, records):
        if self.profile == "stat6":
            from .stat6.preparation import prepare_stat6

            return prepare_stat6(capability, scientific, records=records)
        from .preparation import prepare_example

        return prepare_example(capability, scientific, cache, records=records)

    def required_cache(self, capabilities):
        # Current STAT6 inputs are checksum-verified package resources. Their
        # imported originals use AssetStore; they have no external download cache.
        if self.profile == "stat6":
            return ()
        keys = {
            key
            for capability in capabilities
            for key in self.cases[self.modules[capability].case_id].files
        }
        return tuple(self.files[key] for key in sorted(keys))


def bundle_catalogue(profile="archive"):
    if profile == "archive":
        return BundleCatalogue(
            profile,
            catalogue.MODULES,
            catalogue.CASES,
            catalogue.FILES,
            hashlib.sha256(Path(__file__).with_name("catalogue.json").read_bytes()).hexdigest(),
        )
    if profile != "stat6":
        raise ValueError("Unknown public example study profile.")
    from .stat6 import catalogue as stat6

    content = {
        "manifest": stat6.MANIFEST,
        "modules": {key: module.model_dump(mode="json") for key, module in stat6.MODULES.items()},
    }
    digest = hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    ).hexdigest()
    return BundleCatalogue(profile, stat6.MODULES, {stat6.CASE.id: stat6.CASE}, stat6.FILES, digest)
