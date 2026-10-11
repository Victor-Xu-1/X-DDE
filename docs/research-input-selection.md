# Research input selection / 研究材料选择

The shared structure/molecule picker keeps new upload as its blank-task default. Historical files include both original uploads and explicitly saved molecular/structural records. Reading the catalogue does not create a task or change an input file.

共用结构/分子选择器在空白任务中默认上传新文件。历史文件包含原始上传材料和明确保存的分子/结构记录；读取列表不会创建任务或修改文件。

Selecting a replacement immediately removes the previous material from the task draft. The replacement becomes eligible only after its metadata matches the requested file, supported format and molecular kind; a saved reference must retain the same SHA-256, record, conformer and version. Closing the picker or changing input route cancels an outstanding read. A late response cannot restore a cancelled input.

切换材料会立即从任务草稿中清除旧选择。所选文件的身份、支持格式与类型核对成功后，才允许继续；保存记录还须保持相同校验值、分子记录、构象及版本。关闭选择器或切换输入方式会取消未完成读取，迟到的回复不能恢复已取消的选择。

Catalogue and selected-file reads each have a thirty-second deadline. Network/service failure offers an explicit retry and keeps the new input unselected until recovery. Identity or format mismatch asks the researcher to choose the original/supported file again; it never silently substitutes a different record or exposes internal server paths. Original uploads are paged through the existing API, so files older than the first hundred remain available within the bounded selection window.

列表和文件核对分别限时 30 秒。网络或服务失败可明确重试，恢复之前不使用旧材料代替。身份或格式不匹配时提示重新选择原始/支持的文件，不自动替换记录，也不展示服务器内部路径。原始上传文件沿用现有接口分页读取，最近 100 份之前的材料也可在有限的选择范围内找到。

The focused `reference-input-checks.yml` gate covers the shared picker and directly connected questionnaires. Native Chromium checks use unchanged STAT6 9BIG and 4Y5U structures, hold a metadata reply to exercise the real deadline, test a mismatched saved-reference hash, and verify the actual review filename and original download bytes. No simulation or new owner scientific task is performed. Metadata acceptance does not establish force-field compatibility, pose correctness or scientific accuracy.

专项检查覆盖共用选择器及直接相关问卷。Chromium 使用原样保留的 STAT6 9BIG、4Y5U 结构，暂缓文件回复验证真实超时，检查保存记录的校验值不一致，并核对实际确认页文件名和原始下载字节。不运行模拟或新增本机科学任务；材料身份核对不代表力场兼容、姿势正确性或科学准确性已经通过。
