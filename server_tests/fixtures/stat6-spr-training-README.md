These files replay the actual X-DDE v0.6.10 frontend-submitted Chemprop run
`d90b04d5-f76d-44db-8762-78ff550dc1ec` for display regression checks. The browser
checks do not train a model, populate real user history or establish scientific
acceptance. The original job uses 163 distinct molecules, 30 CPU epochs and seed
2026. Its scaffold split contains 131 training, 16 validation and 16 test records.

The native held-out result is deliberately retained with its **negative R²**:
RMSE 0.9588102920766935 pKd, MAE 0.7717642033502687 pKd, R²
-0.19374784151046387. Independent review found an almost identical error for a
constant training-mean baseline. This is a reproducible workflow example, not an
accepted predictive model or an experimental validation claim.

Reported Kd observations come from [BindingDB entry 13376, assay 1](https://www.bindingdb.org/rwd/jsp/dbsearch/assay.jsp?assayid=1&entryid=13376),
[US20250340551A1](https://patents.google.com/patent/US20250340551A1/en),
data DOI [10.7270/Q2ZC87P0](https://doi.org/10.7270/Q2ZC87P0).
BindingDB data attribution and **CC-BY-3.0-US** apply to the reported source data;
pKd was calculated as `9 - log10(Kd in nM)`. The complete 192 original
observations, 29 exclusions and 163 retained structures are documented by the
existing STAT6 SPR provenance input. Native predictions are software output.

The CSV retains its exact original bytes, SHA256
`e2fcbadc51df6fc4b207b6a3772e62d8384f0555399c1edb4d18af91adcbc446`.
The model's original checkpoint identity is retained in the result manifest;
the checkpoint is not embedded in this UI replay fixture.

The current browser gate restores the reviewed public case package first. Its
real persisted task, model and CSV are used without seeding job rows or mocking
HTTP responses. These small fixtures remain independent checks of the original
job, result and CSV. Both CSV and checkpoint downloads are checked through the
actual platform API, followed by the saved PROTAC-region example.
