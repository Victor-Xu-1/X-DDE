# Research input selection / 研究材料选择

The shared structure/molecule picker keeps new upload as its blank-task default. Historical files include both original uploads and explicitly saved molecular/structural records. Reading the catalogue does not create a task or change an input file.

共用结构/分子选择器在空白任务中默认上传新文件。历史文件包含原始上传材料和明确保存的分子/结构记录；读取列表不会创建任务或修改文件。

Task-result inputs use the same file and scientific-version authority. **Research tasks** is the default source; **Example results** is a separate explicit choice. Completed tasks are searched on the server and paginated in groups of 20, so sources older than the first hundred remain accessible. Only the active source selector is shown. A successful handoff closes the selector and retains the confirmed filename.

任务结果沿用同一文件与科学版本权威。“研究任务”为默认来源，“示例结果”需要明确选择。已完成任务按名称或编号在服务器查询，每页 20 项，前一百项以外的来源仍可找到。一次只显示一种来源选择器；成功交接后收起选择区并保留确认的文件名。

Fixed-example source names are projected from the existing immutable case pins and their declared task evidence. They show the actual research case and task type in the selected language, retain distinct archived/STAT6 identities, and support literal search by either language. A generated engine title never supplies a case identity. Unlinked historical references remain reachable with an explicit generic label. Personal task names and all saved requests remain verbatim. Source identity remains visible when the current choice falls outside the search/page.

固定案例来源的名称从已有的不可变案例记录及其明确关联任务生成，显示实际研究案例和任务类型，随界面语言切换，并支持按任一语言的名称进行文字搜索。历史案例与 STAT6 案例保持各自身份，工程化任务标题不能用来推断案例。没有关联案例的历史材料仍可找到，并明确标为历史参考结果。个人任务名称和全部保存请求保持原样；当前选择不在搜索结果或本页中时，仍显示其案例身份。

The source picker uses compact, accessible radio choices. Task and result-file fields share a row only when the actual input region is wide enough; narrow regions stack the fields. Reduced-motion preferences suppress the short entrance transition. Display changes never modify file bytes or submission eligibility.

来源切换使用紧凑、支持键盘操作的单选项。仅在材料区实际宽度足够时并排显示任务和结果文件，窄区域逐项排列；减少动态效果的设置会关闭短暂入场过渡。展示调整不会修改文件字节或提交资格。

Research-file annotations are saved as new versions through the existing object authority. A confirmed reply must match the original file, record, conformer and requested annotations; an uncertain response retains the same registration key. Saving temporarily locks annotation fields. Selecting another material or clearing selection changes the viewing intent, so a late successful save cannot take the view back. Relationship reads cancel superseded focus requests, retain an explicitly selected older material on refresh and reject delayed replies after leaving the workspace. Researchers receive concise recovery messages; internal registration diagnostics stay on the server.

研究文件备注通过原有对象权威保存为新版本。确认回复须匹配原始文件、记录、构象和请求的备注；回复不确定时保留同一登记标识。保存期间暂时锁定备注字段。选择其他材料或取消选择会改变当前查看意图，迟到的成功保存不能抢回视图。关系读取会取消被替换的聚焦请求，刷新时保留明确选中的旧材料，离开工作空间后不应用迟到回复。页面提供简洁的恢复提示，内部登记诊断保留在服务器中。

Before saving a result as input, the client verifies its source task, relative filename, size and SHA-256. The server checks the expected digest again before writing, rejects changed bytes, and retains its existing per-engine scientific eligibility checks. Replacement clears the previous input immediately. Lost replies retry the same verified source and request key; switching source, replacing input or leaving the picker cancels outstanding work. Late or timed-out replies cannot restore an abandoned selection. Unsupported, empty, oversized and internal engineering files do not become input choices. Existing originals and source-task lineage remain unchanged.

结果保存为输入前，前端核对来源任务、相对文件名、大小及 SHA-256；服务器在写入前再次核对期望校验值，拒绝变化的字节，并保留各引擎原有的科学资格校验。开始替换时立即清除旧输入。回复丢失后重试仍使用同一核实来源与请求标识；切换来源、替换材料或离开选择器会取消进行中的请求，迟到或超时回复不能恢复放弃的选择。不支持、空白、过大及内部工程文件不进入材料选项；原始文件及来源任务关系保持不变。

Ordinary file and FASTA inputs use the same server-filtered catalogue, including configuration, MSA, templates and measurements. Sequence history retains exact saved references, rejects files exceeding 2 MiB, and cancels superseded metadata checks. Pasted sequences are saved only through **Confirm sequences**; an uncertain response can be retried with the same confirmed upload and idempotent version request. Leaving or editing the input cannot apply a late save reply. Large screening/DEL datasets continue to use their existing resumable uploader.

普通文件与 FASTA 共用按名称、类型和格式分页的目录，覆盖配置、MSA、模板和实验测量文件。序列历史保留准确的保存记录，拒绝超过 2 MiB 的文件，并取消被替换的详情读取。粘贴内容只在点击“确认序列”后保存；回复不确定时重试仍沿用同一上传文件和幂等保存请求。离开或编辑输入后，迟到的保存回复不会写回当前选择。筛选/DEL 大数据仍使用已有的断点续传入口。

Selecting a replacement immediately removes the previous material from the task draft. The replacement becomes eligible only after its metadata matches the requested file, supported format and molecular kind; a saved reference must retain the same SHA-256, record, conformer and version. Closing the picker or changing input route cancels an outstanding read. A late response cannot restore a cancelled input.

切换材料会立即从任务草稿中清除旧选择。所选文件的身份、支持格式与类型核对成功后，才允许继续；保存记录还须保持相同校验值、分子记录、构象及版本。关闭选择器或切换输入方式会取消未完成读取，迟到的回复不能恢复已取消的选择。

Catalogue and selected-file reads each have a thirty-second deadline. Network/service failure offers an explicit retry and keeps the new input unselected until recovery. Identity or format mismatch asks the researcher to choose the original/supported file again; it never silently substitutes a different record or exposes internal server paths. The read-only input catalogue searches the existing file/version authority and returns one page of 25 matching choices. The previous whole-history scan and ten-thousand-record selection ceiling are retired. A current selection outside the search/page remains visibly named without being presented as a matching result.

列表和文件核对分别限时 30 秒。网络或服务失败可明确重试，恢复之前不使用旧材料代替。身份或格式不匹配时提示重新选择原始/支持的文件，不自动替换记录，也不展示服务器内部路径。只读材料目录从现有文件/版本权威按名称、类型和页码查询，每页 25 项；移除整库扫描及一万条的旧选择窗口。当前文件不在搜索结果或当前页时，仍明确显示其名称，但不伪装成匹配的搜索结果。

Whole SDF collections and individual molecular records have different input contracts. Library tasks select original SDF files and verify their ID, hash, type, size and whole-file reference before advancing. Externally replacing or clearing a controlled library input clears the old visible filename/eligibility; cancelled reads cannot restore it. An immutable single-record choice cannot masquerade as a whole library. MOL files never show SDF record controls. Editable SDF record numbers accept integers from 1 to 500; empty/out-of-range/decimal edits disable the input until corrected and do not silently retain a previous eligible record.

整组 SDF 文件与单个分子记录有不同的输入语义。分子库任务选择原始 SDF 文件，在继续之前核对标识、校验值、类型、大小及整组文件引用。外部替换或清空材料后不保留旧文件名或可提交状态，已取消的读取不能恢复旧材料。单条分子记录不能代替整组分子库。MOL 文件不显示 SDF 记录选择；可编辑的 SDF 记录号仅接受 1–500 的整数，空值、越界或小数会使输入暂时不可用，修正后才能继续，不保留旧记录冒充新输入。

The focused `reference-input-checks.yml` gate covers the shared picker and directly connected questionnaires. Native Chromium checks use unchanged STAT6 9BIG and 4Y5U structures, hold a metadata reply to exercise the real deadline, test a mismatched saved-reference hash, and verify the actual review filename and original download bytes. No simulation or new owner scientific task is performed. Metadata acceptance does not establish force-field compatibility, pose correctness or scientific accuracy.

专项检查覆盖共用选择器及直接相关问卷。Chromium 使用原样保留的 STAT6 9BIG、4Y5U 结构，暂缓文件回复验证真实超时，检查保存记录的校验值不一致，并核对实际确认页文件名和原始下载字节。不运行模拟或新增本机科学任务；材料身份核对不代表力场兼容、姿势正确性或科学准确性已经通过。

The additional result-handoff browser check uses a checksum-verified, retained native docking output in isolated CI state. It adds 125 controlled metadata-only history rows to exercise older-source paging, deliberately loses an actual registration reply, and verifies that retry creates no additional asset/version, preserves original bytes and submits no scientific job. These metadata rows are transport fixtures, not research examples.

结果交接的额外浏览器检查在独立 CI 中使用校验通过的历史原生对接输出。增加 125 条仅含元数据的受控历史记录来验证旧任务分页，故意丢失真实保存请求的回复，再核对重试不增加文件/版本、原始字节不变及没有递交科学任务。这些元数据记录仅用于交互测试，不是科研案例。
