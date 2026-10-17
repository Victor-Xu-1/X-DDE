# STAT6 SPR model: a completed workflow with insufficient predictive performance

The v0.6.10 frontend submitted native Chemprop job
`d90b04d5-f76d-44db-8762-78ff550dc1ec` using 163 distinct molecules from a single
STAT6 SPR assay. The task used CPU 2, 4096 MiB, 30 epochs and the prospectively
chosen seed 2026. It completed without running dynamics, FEP or another model.

The inputs retain full-precision reported Kd, transformed as
`pKd = 9 - log10(Kd in nM)`. The original 192 observations and all 29 excluded
records remain in the source provenance. Cellular IC50 and the supplied private
warhead/PROTAC are not substituted for these measurements.

| Independent review | Result |
| --- | --- |
| Train / validation / test molecules | 131 / 16 / 16 |
| Nonchiral Murcko scaffolds in those partitions | 11 / 6 / 8 |
| Graph or scaffold overlap across partitions | None |
| Test RMSE | 0.9588102921 pKd |
| Test MAE | 0.7717642034 pKd |
| Test R² | -0.1937478415 |
| Constant training-mean predictor, test RMSE | 0.9597919148 pKd |

Every retained graph and label was independently checked against the original
source and the native split files. The native prediction errors were recomputed.
The model's error is almost identical to the constant training-mean baseline.
The best logged validation MSE occurred at epoch 4; simply extending training
because of the test result is not justified. The test set is small and from one
assay, and the source experiments have not been independently reproduced.

This run is useful for demonstrating training, scaffold isolation, error review,
checkpoint transfer and reproducible model reuse. **It is not an accepted
predictive model.** Saving a checkpoint or completing a task does not establish
reliable affinity prediction, experimental replication or applicability to the
private study molecules. Do not search seeds or tune against this test set to
obtain a preferred score. Further predictive claims require defensible new
validation and appropriate experimental data.

The browser review links each held-out record to its actual molecular graph,
reported value, prediction and error. The original model and data remain
downloadable. Portable case export follows the validated native result manifest
to retain binary checkpoint dependencies, without rewriting existing sealed pins.

Source: [BindingDB entry 13376 / assay 1](https://www.bindingdb.org/rwd/jsp/dbsearch/assay.jsp?assayid=1&entryid=13376),
[US20250340551A1](https://patents.google.com/patent/US20250340551A1/en),
DOI [10.7270/Q2ZC87P0](https://doi.org/10.7270/Q2ZC87P0). Reported source data retain
CC-BY-3.0-US attribution; model predictions are computational output. The
[browser fixture notes](../server_tests/fixtures/stat6-spr-training-README.md)
identify the exact retained output used for display checks.
