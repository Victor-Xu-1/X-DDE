# Native sequence alignment inspection

Target MSA results display the native task's complete, portable A3M files through
the existing task-artifact authority. The viewer uses the client-only
[JBrowseMSA React component](https://github.com/GMOD/JBrowseMSA), MIT licensed,
loaded as a separate lazy chunk. It does not send sequences to an external viewer.

The frontend checks the declared SHA-256, exact byte length, query, row count and
match-column width before rendering. An aborted or late response cannot replace
the next task's result. Failed reads have an explicit retry; original scientific
downloads remain available. Historical jobs without portable alignments keep
their query-only view and are not presented as complete matrices.

The displayed matrix contains every original row and the query's match columns.
Lowercase A3M insertions and dot placeholders are excluded from match columns,
and remain unchanged in the original A3M. Ordinal prefixes keep repeated native
FASTA identifiers distinct in the viewer. A paired file with only the query is
shown as one row. No phylogeny is inferred or fabricated.

Users can scroll through the complete alignment, change residue colors and
column widths, navigate to a one-based query position, inspect a clicked residue,
download the original A3M, and export the visible region as SVG. The visible-region
export is deliberately labelled as such; it is not a complete-alignment export.
Changing column width retains the currently centered query position. Scientific
download URLs remain alive for60 seconds so an embedded browser can complete a
deferred file handoff; the bytes are then released.

Preview admission is bounded to25 MiB,50000 rows,10000 columns and30 million match
cells. Oversized or inconsistent metadata is rejected with the source report
still downloadable. The library's own error boundary cannot crash the task page.

The exact scoped CI selection is `alignment-views` in Scientific upgrade scoped
checks. Real full-depth alignment interaction and downloads are additionally
reviewed on the deployed unchanged localhost frontend; synthetic CI fixtures do
not establish biological significance or homology quality.
