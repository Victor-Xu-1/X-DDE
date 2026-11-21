# Native recognition workbench language integration

X-DDE's image utility and task-image dialog use the existing local recognition workbench. Language synchronization changes native React labels only; it does not transfer credentials, start a model, change a molecule, import an image, or replace the host's authentication and export contracts.

The parent opts in with `xdde-locale=1`, an exact `parent` origin and an initial `lang=en|zh`. Locale messaging works independently of image-import mode and Ketcher readiness. Each update has protocol version 1 and a fresh UUID. The host verifies the embedding parent window and allowed origin, validates the language, updates its own React state and acknowledges that UUID/language. X-DDE verifies the source frame, host origin and current acknowledgement. Switching language retains the iframe URL/node, image, graph, Ketcher instance and pending export. A host without this capability remains usable and displays a localized compatibility hint. Reconnect is an explicit reload; language switching is not.

Production embedding remains limited to the existing 4322 loopback origins. The existing 4330 development-origin adapter entry does not expand production CSP. No cross-origin DOM translation, token forwarding, additional OCR engine, queue or model environment is introduced.

## Existing host companion

The installed X-DDE wheel includes canonical native locale/display modules and a bounded, hash-checked integration manifest for the known `decimer-workbench-ui-0.1.0` source. Its six native targets cover App, editor boundary, stop confirmation, molecule editor, readiness state and the existing image-export adapter. Ten flat companion resources share the platform's editor contract, native hydrogen/appearance policy and per-canvas lifecycle. The target manifest contains no private configuration, uploads, models or unrelated host source. The separate host repository is not published.

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

## Native molecular display

The recognition editor uses the same native Indigo layout/folding and appearance rules as X-DDE's drawings. Software-owned incoming structures receive a separate 2D display representation before one undoable canvas commit. Unclassified native draw/paste/undo events are validation-only: they never append automatic replacements to history. A drawing with explicit non-donor H or spatial coordinates is retained behind a preparation prompt; the user can continue Undo/Redo or explicitly choose Prepare 2D drawing. That action requests native 2D layout, verifies the identity and zero-Z result, and commits one derived drawing. Ordinary skeletal edits retain their layout. The original source bytes, 3D coordinates and SDF properties are not rewritten; edited MOL/SDF exports use V3000 and are derived representations, not byte-preserving source exports.

Canvas operations have one in-memory lifetime, separate from scientific scheduling. A resolved native `setMolecule()` is not assumed successful: native failure events and resulting molecular identity are checked before the display is made usable. Older preparations cannot overwrite a newer intent, and closing the editor prevents stale publication. Host-owned exports and task transfer wait for an available display without reconnecting the image session. Ketcher's own native file/clipboard commands remain its source-data tools; this adapter does not claim to intercept their shortcuts. Unsupported identity-preserving display conversions retain the source and report a limitation. The recovery action explicitly reviews the current retained structure; a KET backup can be downloaded without discarding it.

The native small-molecule zoom/centering API is supplied by the companion adapter; a hidden canvas is fitted once it becomes visible, and a material work-area resize refits the view without changing the drawing. Normal drawing and manual layout do not trigger whole-graph rearrangement. Ketcher's redundant image-recognition and unverified 3D-viewer buttons are hidden in this 2D input editor. X-DDE's existing managed 3D previews remain the authority for computed/minimized poses; a 2D drawing is not presented as a calculated 3D result.

Refs #235. Candidate validation and installed-browser acceptance must be recorded separately.

## Copying to ChemDraw

Use **Copy SMILES**, then **Edit → Paste Special → SMILES** in ChemDraw. The recognition editor copies a single isomeric SMILES line and checks it against a read-back of the current structure. At the initial recognition revision it also checks the recognized source. Subsequent edits export from the current drawing.

A recognized result can combine planar drawing coordinates with absolute stereo labels. The export verifies the absolute configuration without the drawing coordinates and keeps the isomeric markers in plain SMILES. For ring E/Z geometry stored in an extension, the editor uses the recognized source's standard slash notation only when its geometry agrees with both the source and current drawing. Download **MOL** for relative stereo groups, ambiguous bonds or any structure whose plain SMILES cannot be verified. Open the file in ChemDraw to keep the available bond and stereochemical annotations. Compare stereochemical wedges and double bonds against the source image before using an OCR result.

An edited drawing can also export ring E/Z geometry. The editor expresses indexed ring geometry with ordinary directional bonds and reads it back through the native chemistry engine. It enables copy only when the recovered geometry and molecular identity agree with the current drawing.

If a recognized ring configuration is missing from the generated drawing, the image utility can still offer SMILES from the recognition result. Each declared ring configuration must be distinguishable by the native reader and survive a read-back with the absolute configuration. The active drawing and normalized recognition text must corroborate the source structure. A drawing that lost the declared geometry is unavailable for MOL/SDF export and task transfer.

For a chiral structure with a monovalent radical, the editor allows plain SMILES when reading the bracket atom restores the same radical on the same atom. Drawings with a separately specified spin state can use the structure-file export. When the recognized source itself supplies an explicit radical annotation that the drawing path cannot verify, the original image stays available and the converted exports are withheld.

For recognized absolute configurations, the derived V2000 or V3000 drawing carries the absolute chiral flag. In V3000 this also covers explicitly specified centers outside a partial `STEABS` collection. Drawings containing relative or mixture collections retain their flags and use the structure-file export.

When the recognizer returns allene stereochemistry that the drawing pipeline cannot preserve, the image utility offers a single-line SMILES with the source atom order and axial configuration. Copy and download express `@AL1` as `@` and `@AL2` as `@@` at verified allene centers. These equivalent OpenSMILES spellings avoid a ChemOffice 22 round-trip issue with the explicit class markers. Review the imported structure in ChemDraw. The incompatible drawing, MOL/SDF export and task transfer are unavailable for that recognition. If the drawing reader cannot classify the axial center or the source uses annotations outside a single ordinary SMILES line, the utility withholds export and explains the limitation.

Recognized square-planar, trigonal-bipyramidal and octahedral assignments are withheld from converted exports when the drawing and import path cannot verify their configuration.
