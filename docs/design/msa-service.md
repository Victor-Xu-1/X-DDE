# Native MSA service configuration

X-DDE's reviewed OpenDDE runtime uses the ColabFold-compatible MMseqs2 protocol.
The older Harness target-MSA wrapper supplies a Protenix address when no explicit
endpoint exists. Combining these defaults sends the new protocol to the wrong
service. A running process or a query-only alignment is not successful MSA
preparation.

The platform now explicitly supplies `MMSEQS_SERVICE_HOST_URL` to the native
Docker factory. The default is `https://api.colabfold.com`, matching the reviewed
runtime and the [official ColabFold client](https://github.com/sokrypton/ColabFold/blob/main/colabfold/colabfold.py).
An operator can set `WB_MSA_URL` to a compatible self-hosted endpoint. This is
server configuration, not an editable task URL. Credentials, query parameters,
fragments and malformed endpoints are rejected.

The private compute connection records the applied endpoint. Older connections
remain readable. Status reports that an update is required; it does not silently
modify a running container. Applying the update retires only the exact owned
instance after the existing platform and native idle checks, then recreates it
with the same port, token, image, source and shared data directory. A busy or
unverifiable service leaves the original private configuration unchanged. An
already applied endpoint causes no replacement.

This changes neither native scientific source nor model weights. The target-MSA
adapter still verifies the exact query identity, both complete A3M files and an
unpaired depth greater than one. A single-target paired file may contain only the
query and supplies no interchain coevolution evidence. Failed searches stay
failed; no query-only result is promoted to a homologous MSA or a successful fold.

Scoped checks cover native-factory forwarding, legacy migration, busy refusal,
repeat start, endpoint validation and immutable example restoration. Actual
endpoint use and real alignment quality require native runtime acceptance after
deployment; contract checks alone do not establish scientific success.
