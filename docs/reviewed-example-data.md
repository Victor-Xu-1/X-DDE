# Reviewed module examples

These immutable archives contain actual native inputs, outputs, provenance and module pins. Installing them restores data into X-DDE's existing asset and example stores; it does not start scientific computation.

| Archive | Primary module examples | Additional workflow example | Native scope |
| --- | ---: | ---: | --- |
| STAT6 data 31 | 57 | 1 | Defined-molecule studies, reviewed SH2 pose hypotheses, native ESM2 and backbone-conditioned surface-construct proposals, complete alignments, an antibody-family structural search, and a bounded research workflow |
| DEL data 4 | 9 | 0 | Public UNC DEL006 / BRD4 selection data, including independent held-out building-block validation |

The required primary-module acceptance ledger is **66/71**. Five primary cases remain unaccepted; MD and FEP remain excluded and paused. Archive installation is a technical data-delivery check, separate from experimental validation of a scientific conclusion.

The three-pose example opens the reviewed third sample without changing original native ranks. Higher-scoring samples collide with omitted experimentally observed receptor domains. The third sample is a regional hypothesis with changed side-chain rotamers, rather than a validated binding mode. Its linked PLIP stage retains a long, geometry-dependent Q590 hydrogen-bond candidate (donor–acceptor 3.77 Å); this is not a binding-strength measurement.

The sequence-design examples preserve their actual sampling behavior. ESM2 650M proposes four distinct single mutants using a nonnegative masked log-likelihood ratio. A bounded backbone-conditioned follow-up yields eight distinct sequences while preserving all111 non-design positions. Several proposals introduce an exposed Q585L/I substitution and remain developability concerns; favorable model scores do not establish improved solubility or function. Earlier duplicate-rich and unchanged-WT samples remain historical evidence. The results distinguish samples from unique sequences and changed variants, retain original ranks, and identify exported FASTA records by task, sample and chain.

The STAT6 alignment example preserves all **3,245 × 847** unpaired match columns and the original one-row paired file. A query-only paired alignment supplies no interchain coevolution evidence. The 6WGL antibody examples target IL-4Rα in the STAT6 pathway, rather than binding STAT6 directly.

The antibody structure-search example was submitted through the released frontend using the experimental 6WGL heavy variable domain, residues1–125. The native search returned one antibody-like hit from a requested top five: **P01823**, score **32.816**,113residues. Its sequence exactly matches the independently checked UniProt mouse Ig heavy-chain variable-region record. This is a family-level reference, not a validated IL-4Rα or STAT6 binder. The large3D view retains the experimental query; the engine returned no candidate coordinates, so no candidate structure or RMSD is invented. The fixed example preserves the actual response, input identity, sequence/table downloads and explicit scientific limitations.

The small-molecule property-model example intentionally retains its poor held-out performance: test R² **−0.194** over 16 held-out molecules. Its study-molecule pKd output is exploratory and is unsuitable for validated affinity ranking. The DEL model likewise fails to improve its held-out mean baseline: RMSE **0.6674** versus **0.6637**, with Spearman correlation **0.0360** over 10,750 held-out members. These examples demonstrate model application, independent review and rejection of an unsupported predictive claim.

Source and output hashes, original native files, explicit limitations and historical results are preserved. Repeated import must leave existing personal projects and stored records unchanged.
