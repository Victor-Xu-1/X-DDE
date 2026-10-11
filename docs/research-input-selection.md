# Research input selection / 研究材料选择

The shared structure/molecule picker keeps new upload as its blank-task default. Historical files include both original uploads and explicitly saved molecular/structural records. Reading the catalogue does not create a task or change an input file.

共用结构/分子选择器在空白任务中默认上传新文件。历史文件包含原始上传材料和明确保存的分子/结构记录；读取列表不会创建任务或修改文件。

Selecting a replacement immediately removes the previous material from the task draft. The replacement becomes eligible only after its metadata matches the requested file, supported format and molecular kind; a saved reference must retain the same SHA-256, record, conformer and version. Closing the picker or changing input route cancels an outstanding read. A late response cannot restore a cancelled input.

切换材料会立即从任务草稿中清除旧选择。所选文件的身份、支持格式与类型核对成功后，才允许继续；保存记录还须保持相同校验值、分子记录、构象及版本。关闭选择器或切换输入方式会取消未完成读取，迟到的回复不能恢复已取消的选择。

Catalogue and selected-file reads each have a thirty-second deadline. Network/service failure offers an explicit retry and keeps the new input unselected until recovery. Identity or format mismatch asks the researcher to choose the original/supported file again; it never silently substitutes a different record or exposes internal server paths. The read-only input catalogue searches the existing file/version authority and returns one page of 25 matching choices. The previous whole-history scan and ten-thousand-record selection ceiling are retired. A current selection outside the search/page remains visibly named without being presented as a matching result.

列表和文件核对分别限时 30 秒。网络或服务失败可明确重试，恢复之前不使用旧材料代替。身份或格式不匹配时提示重新选择原始/支持的文件，不自动替换记录，也不展示服务器内部路径。只读材料目录从现有文件/版本权威按名称、类型和页码查询，每页 25 项；移除整库扫描及一万条的旧选择窗口。当前文件不在搜索结果或当前页时，仍明确显示其名称，但不伪装成匹配的搜索结果。

Whole SDF collections and individual molecular records have different input contracts. Library tasks select original SDF files and verify their ID, hash, type, size and whole-file reference before advancing. Externally replacing or clearing a controlled library input clears the old visible filename/eligibility; cancelled reads cannot restore it. An immutable single-record choice cannot masquerade as a whole library. MOL files never show SDF record controls. Editable SDF record numbers accept integers from 1 to 500; empty/out-of-range/decimal edits disable the input until corrected and do not silently retain a previous eligible record.

整组 SDF 文件与单个分子记录有不同的输入语义。分子库任务选择原始 SDF 文件，在继续之前核对标识、校验值、类型、大小及整组文件引用。外部替换或清空材料后不保留旧文件名或可提交状态，已取消的读取不能恢复旧材料。单条分子记录不能代替整组分子库。MOL 文件不显示 SDF 记录选择；可编辑的 SDF 记录号仅接受 1–500 的整数，空值、越界或小数会使输入暂时不可用，修正后才能继续，不保留旧记录冒充新输入。

The focused `reference-input-checks.yml` gate covers the shared picker and directly connected questionnaires. Native Chromium checks use unchanged STAT6 9BIG and 4Y5U structures, hold a metadata reply to exercise the real deadline, test a mismatched saved-reference hash, and verify the actual review filename and original download bytes. No simulation or new owner scientific task is performed. Metadata acceptance does not establish force-field compatibility, pose correctness or scientific accuracy.

专项检查覆盖共用选择器及直接相关问卷。Chromium 使用原样保留的 STAT6 9BIG、4Y5U 结构，暂缓文件回复验证真实超时，检查保存记录的校验值不一致，并核对实际确认页文件名和原始下载字节。不运行模拟或新增本机科学任务；材料身份核对不代表力场兼容、姿势正确性或科学准确性已经通过。
