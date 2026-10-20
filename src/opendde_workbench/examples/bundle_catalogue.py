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

    def study_profile(self, capability):
        if self.profile == "current":
            return "del6" if capability.startswith("del.") else "stat6"
        return self.profile

    def case_for(self, capability):
        if self.study_profile(capability) == "stat6":
            from .stat6.reference_inputs import case_for

            return case_for(capability)
        return self.cases[self.modules[capability].case_id]

    def visible_files(self, capability):
        return [self.files[key] for key in self.case_for(capability).files]

    def study(self, capability):
        profile = self.study_profile(capability)
        if profile == "stat6":
            from .stat6.catalogue import study_context

            return study_context(capability)
        if profile == "del6":
            from .del6.guidance import context

            return context(capability)
        return None

    def prepare(self, capability, scientific, cache, records):
        profile = self.study_profile(capability)
        if profile == "stat6":
            from .stat6.preparation import prepare_stat6

            return prepare_stat6(capability, scientific, records=records, modules=self.modules)
        if profile == "del6":
            from .del6.preparation import prepare_del6

            return prepare_del6(capability, scientific, cache, records=records)
        from .preparation import prepare_example

        return prepare_example(capability, scientific, cache, records=records)

    def required_cache(self, capabilities):
        # Current STAT6 inputs are checksum-verified package resources. Their
        # imported originals use AssetStore; they have no external download cache.
        if self.profile != "archive":
            # Current cohorts replay sealed native requests whose original assets
            # are already retained in the bundle. Reading fixed results must not
            # redownload materials or create replacement scientific versions.
            return ()
        keys = {
            key
            for capability in capabilities
            for key in self.cases[self.modules[capability].case_id].files
        }
        return tuple(self.files[key] for key in sorted(keys))


def bundle_catalogue(profile="archive"):
    if profile == "current":
        cohorts = {name: bundle_catalogue(name) for name in ("stat6", "del6")}
        content = {name: cohort.digest for name, cohort in cohorts.items()}
        return BundleCatalogue(
            profile,
            {key: value for cohort in cohorts.values() for key, value in cohort.modules.items()},
            {key: value for cohort in cohorts.values() for key, value in cohort.cases.items()},
            {key: value for cohort in cohorts.values() for key, value in cohort.files.items()},
            hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest(),
        )
    if profile == "del6":
        from .del6 import catalogue as del6

        digest = hashlib.sha256(
            json.dumps(del6.MANIFEST, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
        ).hexdigest()
        return BundleCatalogue(profile, del6.MODULES, {del6.CASE.id: del6.CASE}, del6.FILES, digest)
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
