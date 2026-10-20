"""Select DEL evidence changes; separate native enrichment from barcode/UMI consumers."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "frontend/src/datasets/BarcodeQuality*",
    "frontend/src/datasets/barcode-quality*",
    "frontend/src/datasets/DatasetCharts*",
    "frontend/src/datasets/DatasetResults*",
    "frontend/src/datasets/ResearchTable*",
    "frontend/src/datasets/followup-observation*",
    "frontend/src/datasets/CandidateView*",
    "frontend/src/datasets/DELCandidateEvidence*",
    "frontend/src/datasets/useDELCandidateEvidence*",
    "frontend/src/datasets/candidate-evidence.css",
    "frontend/src/datasets/SeriesEvidencePlots*",
    "frontend/src/datasets/SeriesEnrichmentPlot*",
    "frontend/src/datasets/MonosynthonPlot*",
    "frontend/src/datasets/DELSeriesContext*",
    "frontend/src/datasets/series-map*",
    "frontend/src/datasets/statistical-plots*",
    "frontend/src/datasets/chart-documents*",
    "frontend/src/datasets/SequencingDiagnostics*",
    "frontend/src/datasets/SequencingQualityPlot*",
    "frontend/src/datasets/sequencing-quality*",
    "frontend/src/datasets/UMICountChoices*",
    "frontend/src/datasets/umi-count-readiness*",
    "frontend/src/datasets/result-labels.ts",
    "frontend/src/datasets/useDELForm.ts",
    "frontend/src/datasets/DELMethodQuestion.tsx",
    "frontend/src/datasets/DELReviewQuestion*",
    "frontend/src/datasets/DELForm.tsx",
    "frontend/src/datasets/DELScopeQuestion.tsx",
    "frontend/src/datasets/DELCountUnit.tsx",
    "frontend/src/datasets/DELAnalysisSupport.test.tsx",
    "frontend/src/datasets/del-analysis-readiness.ts",
    "frontend/src/datasets/evidence-labels.ts",
    "frontend/src/datasets/supplier-label*",
    "frontend/src/datasets/datasets.css",
    "frontend/src/datasets/DELTemplateReplay.test.tsx",
    "src/opendde_workbench/datasets/del_umi.py",
    "src/opendde_workbench/datasets/decoded_view.py",
    "src/opendde_workbench/datasets/native_del_decode.py",
    "src/opendde_workbench/datasets/native_del_count.py",
    "src/opendde_workbench/datasets/backend.py",
    "src/opendde_workbench/datasets/del_options.py",
    "src/opendde_workbench/datasets/del_contract.py",
    "src/opendde_workbench/datasets/del_support.py",
    "src/opendde_workbench/datasets/native_del_analysis.py",
    "src/opendde_workbench/datasets/bindings.py",
    "src/opendde_workbench/datasets/result.py",
    "src/opendde_workbench/datasets/routes.py",
    "src/opendde_workbench/examples/catalogue_profiles.py",
    "src/opendde_workbench/examples/del6/guidance.py",
    "src/opendde_workbench/examples/del6/stage_hints.py",
    "src/opendde_workbench/examples/del6/current-inputs.json",
    "src/opendde_workbench/examples/del6/compatibility.py",
    "src/opendde_workbench/examples/del6/catalogue-profiles.json",
    "src/opendde_workbench/examples/del6/manifest-v1.json",
    "tests/test_del_current_examples.py",
    "tests/test_del_bundle_compatibility.py",
    "tests/test_del_umi.py",
    "server_tests/test_del_umi_count.py",
    "server_tests/test_dataset_native.py",
    "server_tests/dataset_native_fixture.py",
    "server_tests/test_del_analysis_support.py",
    "tests/test_del_analysis_support.py",
    "tests/test_dataset_series_views.py",
    "docs/design/screening-and-del.md",
    "server_tests/barcode_quality_browser.py",
    "server_tests/decoding_quality_browser.py",
    "server_tests/responsive_chart_browser.py",
    "server_tests/test_result_visuals_browser.py",
    "server_tests/test_statistical_previews_browser.py",
    "server_tests/series_quality_browser.py",
    "scripts/del-ci-scope.py",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
    ".github/workflows/chart-quality-checks.yml",
    ".github/workflows/dataset-discovery-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/docking-runtime-checks.yml",
    ".github/workflows/library-member-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/example-result-set-checks.yml",
    ".github/workflows/defined-site-checks.yml",
    ".github/workflows/del-example-guidance-checks.yml",
    ".github/workflows/examples-checks.yml",
)


def main():
    base = os.environ.get("BASE", "")
    default = os.environ.get("DEFAULT_BRANCH", "main")
    reference = os.environ.get("GITHUB_REF_NAME", "")
    if reference and reference != default:
        # Fix-ups belong to the same unpublished batch. Looking only at the last
        # CI-only commit would incorrectly launch unrelated scientific suites.
        base = subprocess.check_output(
            ["git", "merge-base", "origin/" + default, "HEAD"], text=True
        ).strip()
    changed = (
        subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
        if base and set(base) != {"0"}
        else []
    )
    selected = (
        bool(changed)
        and any(
            name.startswith(
                (
                    "frontend/src/datasets/",
                    "src/opendde_workbench/datasets/",
                    "src/opendde_workbench/examples/del6/",
                )
            )
            for name in changed
        )
        and all(any(fnmatch.fnmatchcase(name, pattern) for pattern in PATTERNS) for name in changed)
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("del_only=" + str(selected).lower() + "\n")
        native_paths = {
            name for name in changed if name.startswith("src/opendde_workbench/datasets/")
        }
        # Retained-table/visualization edits do not change native chemistry,
        # FASTQ decoding or enrichment. Their real SQLite/browser gate runs below.
        series_patterns = (
            "frontend/src/datasets/SeriesEvidencePlots*",
            "frontend/src/datasets/SeriesEnrichmentPlot*",
            "frontend/src/datasets/MonosynthonPlot*",
            "frontend/src/datasets/DELSeriesContext*",
            "frontend/src/datasets/series-map*",
            "frontend/src/datasets/chart-documents*",
            "frontend/src/datasets/ResearchTable*",
            "frontend/src/datasets/DatasetCharts*",
            "frontend/src/datasets/DatasetResults*",
            "frontend/src/datasets/datasets.css",
            "src/opendde_workbench/datasets/routes.py",
            "tests/test_dataset_series_views.py",
            "server_tests/series_quality_browser.py",
            "server_tests/test_statistical_previews_browser.py",
            "docs/design/screening-and-del.md",
            "scripts/del-ci-scope.py",
            ".github/workflows/*",
            "pyproject.toml",
            "uv.lock",
            "frontend/package*.json",
            "install.sh",
            "install.ps1",
        )
        series_views = (
            selected
            and any(
                "SeriesEvidencePlots" in name or "test_dataset_series_views" in name
                for name in changed
            )
            and all(
                any(fnmatch.fnmatchcase(name, pattern) for pattern in series_patterns)
                for name in changed
            )
        )
        candidate_patterns = (
            "frontend/src/datasets/ResearchTable*",
            "frontend/src/datasets/followup-observation*",
            "frontend/src/datasets/CandidateView*",
            "frontend/src/datasets/DELCandidateEvidence*",
            "frontend/src/datasets/useDELCandidateEvidence*",
            "frontend/src/datasets/candidate-evidence.css",
            "frontend/src/datasets/DELReviewQuestion*",
            "scripts/del-ci-scope.py",
            ".github/workflows/dataset-discovery-checks.yml",
            ".github/workflows/chart-quality-checks.yml",
            ".github/workflows/task-layout-checks.yml",
            ".github/workflows/user-interface-checks.yml",
            "docs/design/screening-and-del.md",
            "pyproject.toml",
            "uv.lock",
            "frontend/package*.json",
            "install.sh",
            "install.ps1",
        )
        candidate_views = (
            selected
            and any(
                name.startswith(
                    (
                        "frontend/src/datasets/CandidateView",
                        "frontend/src/datasets/DELCandidateEvidence",
                        "frontend/src/datasets/useDELCandidateEvidence",
                        "frontend/src/datasets/ResearchTable",
                        "frontend/src/datasets/followup-observation",
                    )
                )
                for name in changed
            )
            and all(
                any(fnmatch.fnmatchcase(name, pattern) for pattern in candidate_patterns)
                for name in changed
            )
        )
        enrichment_paths = {
            "src/opendde_workbench/datasets/backend.py",
            "src/opendde_workbench/datasets/del_options.py",
            "src/opendde_workbench/datasets/del_contract.py",
            "src/opendde_workbench/datasets/del_support.py",
            "src/opendde_workbench/datasets/native_del_analysis.py",
        }
        enrichment = bool(native_paths & enrichment_paths) or (
            "server_tests/test_del_analysis_support.py" in changed
        )
        native = any(
            name.startswith("src/opendde_workbench/datasets/")
            or name
            in {
                "server_tests/test_dataset_native.py",
                "server_tests/test_del_umi_count.py",
                "tests/test_del_umi.py",
            }
            for name in changed
        )
        # Shared/unknown native edits retain the existing broader gate. A proven
        # enrichment-only batch does not rerun unrelated FASTQ decoding.
        only_enrichment = (
            enrichment
            and native_paths <= enrichment_paths
            and not any(
                name in changed
                for name in (
                    "server_tests/test_dataset_native.py",
                    "server_tests/test_del_umi_count.py",
                    "tests/test_del_umi.py",
                )
            )
        )
        output.write(
            "native_umi_changed="
            + str(native and not only_enrichment and not series_views).lower()
            + "\n"
        )
        output.write("native_enrichment_changed=" + str(enrichment).lower() + "\n")
        output.write("series_views_only=" + str(series_views).lower() + "\n")
        output.write("candidate_views_only=" + str(candidate_views).lower() + "\n")
    print(
        "DEL evidence, catalogue and shared table consumers"
        if selected
        else "Wider changed-feature consumers"
    )


if __name__ == "__main__":
    main()
