# Native installation admission

An installation probe imports the real native command without models, scientific
inputs, GPU access or network access. A successful help command alone does not
publish an environment as installed.

The installer creates a uniquely named container with probe and program labels,
verifies its immutable image and identity, then attaches to its native command.
It records the native exit separately from container removal. Admission requires
an exited process with code zero, no OOM/dead state and confirmed removal through
the platform's shared bounded cleanup authority. Docker auto-removal is not used:
waiting for it previously turned a seven-second successful REINVENT startup into
an unrelated 120-second installation timeout.

Cancellation and timeout preserve the original exception and private evidence.
Cleanup can stop only the exact container with matching unique ownership labels;
an unverified container is never started, stopped or removed. Cleanup failures
remain installation failures and never cause a second native startup. Private
`native-probe.json`, `native-cli.log` and `native-cleanup.json` retain the distinct
evidence; they are not added to the researcher interface.

These files belong to the durable deployment operation rather than a temporary
environment directory. Re-entering an interrupted operation first verifies and
reconciles its previous probe, preserving its evidence in a per-token history.
No new native command starts while previous cleanup remains unconfirmed.

A complete cached image still passes this same admission gate. Source recipes,
dependency locks, model manifests and scientific execution policies are unchanged.
