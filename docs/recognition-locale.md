# Native recognition workbench language integration

X-DDE's image utility and task-image dialog use the existing local recognition workbench. Language synchronization changes native React labels only; it does not transfer credentials, start a model, change a molecule, import an image, or replace the host's authentication and export contracts.

The parent opts in with `xdde-locale=1`, an exact `parent` origin and an initial `lang=en|zh`. Locale messaging works independently of image-import mode and Ketcher readiness. Each update has protocol version 1 and a fresh UUID. The host verifies the embedding parent window and allowed origin, validates the language, updates its own React state and acknowledges that UUID/language. X-DDE verifies the source frame, host origin and current acknowledgement. Switching language retains the iframe URL/node, image, graph, Ketcher instance and pending export. A host without this capability remains usable and displays a localized compatibility hint. Reconnect is an explicit reload; language switching is not.

Production embedding remains limited to the existing 4322 loopback origins. The existing 4330 development-origin adapter entry does not expand production CSP. No cross-origin DOM translation, token forwarding, additional OCR engine, queue or model environment is introduced.

## Existing host companion

The installed X-DDE wheel includes the canonical native locale modules and a bounded, hash-checked integration manifest for the known `decimer-workbench-ui-0.1.0` source. It modifies only the native App, editor error boundary and stop confirmation labels, and adds two locale modules. The target manifest contains no private configuration, uploads, models or unrelated host source. The separate host repository is not published.

Check the exact installed artifact and source before applying:

```sh
python -m opendde_workbench.recognition_companion --host /path/to/existing/decimer-workbench
```

The default is read-only. Apply to a private offline copy of the recognized source with no editors, builders or other writers, and retain backups outside it. The explicit ownership flag is an operator contract, not an automatic filesystem lock. This updater does not support uncoordinated writes during cutover. The original host source can remain untouched while its private integration copy is built:

```sh
python -m opendde_workbench.recognition_companion --host /path/to/private/decimer-source-copy --apply --exclusive-source --backup-directory /path/to/retained/backups
```

Every preimage, bounded hunk and expected postimage is verified before writes. Unknown versions, conflicting adapters and symlinked targets are refused; source changes observed at planning/write boundaries stop cutover. There is no atomic compare-and-swap guarantee against a writer violating the offline ownership contract. A second application is a no-op. A receipt records the original/updated hashes; original files are retained in that unique backup. New adapter files have a null original hash. Ownership and permissions are preserved. Failed replacement recovers each unchanged owned write independently, retains owner-changed/deleted files, and reports incomplete recovery without masking the original failure.

Build the host frontend using its existing environment and its normal deployment process. The companion does not install dependencies, replace the served frontend, restart services or run recognition. Preserve the previous served UI until the new build is accepted. To restore, use the retained originals and previous served frontend; never overwrite later host edits blindly.

Native UI labels, accessibility text, stop confirmation and known interface errors follow English/Chinese. Standalone use without an explicit locale retains its original Chinese labels and document metadata; an explicit `?lang=en|zh` is supported. X-DDE supplies English by default and updates the native UI in place when its language changes. Chemical structures, filenames, SMILES, MOL/SDF, source API diagnostics and native Ketcher tools retain their original data/meaning. The native Ketcher editor's own toolbar language remains governed by its supported capabilities. This integration does not claim a new OCR result or scientific validation.

Refs #231.
