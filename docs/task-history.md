# Task modules and results / 任务模块与结果

Tasks and results opens a compact module overview: targets, structures, pockets and docking, small-molecule design, induced proximity, screening, DEL, biologics, properties and safety, and dynamics/FEP. Choose a module to see its own history, filter by exact task type or status, search by name or ID, and open the existing result preview. The module's **New task** action opens its default questionnaire without submitting anything.

任务与结果默认展示简洁的模块入口：靶点、结构、口袋与对接、小分子设计、诱导邻近、高通量筛选、DEL、生物药、性质与安全性、动力学与 FEP。进入模块后，可按具体任务类型、状态或名称/编号查找任务，并打开原有结果预览。“新建任务”进入该模块的默认问卷，不会自动递交。

Classification follows the actual stored request and the reviewed capability catalogue, never the task title. Shared operations retain their distinctions: docking/score/minimize, individual design modes, target/disease evidence, native protein tools, and MD/FEP methods. Supporting and unclassified historical tasks remain reachable; fixed examples stay in their module's case library. Opening an existing task link selects its module automatically. Selecting another module removes the previous result from view, while selecting a row preserves that list's filters and page.

分类依据保存的真实任务请求及统一能力目录，不依赖任务名称。对接/评分/最小化、分子设计模式、疾病/靶点证据、蛋白工具与 MD/FEP 方法分别识别。辅助与未分类历史任务仍可访问；固定案例仍保留在模块的案例库。任务链接自动定位所属模块；切换模块后不显示旧模块的结果，打开某一任务再返回列表时保留筛选及页码。

Module browsing is represented in the URL even without a selected task. Refreshing restores the module, compatible task type, status, search, page and project. Existing direct task links remain supported. Invalid or incompatible URL filters are discarded before querying; a module overview does not display one mixed task list.

只浏览模块、尚未选择任务时，网址也会保留当前位置。刷新后恢复模块、相容任务类型、状态、搜索、页码和项目；原有任务直达链接继续可用。不合法或不属于该模块的筛选不会传入查询；模块总览不展示混合任务列表。

The read-only `/api/task-history` endpoint queries the existing SQLite authority. It returns 20 rows by default, exact type counts for the selected project, and a filtered total. Search is literal and parameters are bound; pagination uses creation time plus ID as a stable tie-breaker. Rows and counts share a read snapshot. No new task store, queue, result format or data migration is introduced. The UI cancels stale reads, bounds each request to 30 seconds, and keeps an explicit reconnection action and honest empty states. Earlier jobs beyond the first hundred are queried directly rather than silently omitted.

只读接口沿用现有 SQLite 数据权威，默认每页 20 项，返回所选项目的分类计数及筛选后的总数。搜索按文字匹配，使用绑定参数；按创建时间和唯一标识稳定分页，计数及结果采用同一读取快照。不增加平行任务库、队列、结果格式或数据迁移。前端取消过期请求，每次读取限时 30 秒，提供明确的重连入口及空状态；前 100 项之外的历史任务也可直接查询。

Task-history browsing is independent of environment-health reads and global task summaries. Only a failed history request displays its reconnection notice. Task summaries refresh every three seconds after the previous read settles; health refreshes every ten seconds. Each read has a thirty-second deadline and navigation/refresh cancels superseded reads. A failed health read invalidates earlier readiness, so retained results remain readable without presenting an unavailable environment as ready to submit a task.

任务历史浏览独立于环境健康检查及全局任务摘要；仅历史接口读取失败时显示任务重连提示。全局任务摘要在上次读取结束后三秒更新，健康检查十秒更新；每次读取限时三十秒，导航或刷新会取消过期读取。健康检查失败后，先前的可运行状态失效，已有结果仍可浏览，不会把不可用环境显示为可递交任务。

The optional `scope=examples` query is used only when a researcher explicitly chooses a fixed example result as input. Internal installation-validation records are excluded from both input-source lists. The default `research` scope continues to exclude fixed example tasks. Both scopes use the same stable filtering and paging; changing result sources never adds examples to personal task history.

仅在用户明确选择固定示例结果作为材料时使用可选的 `scope=examples` 查询。两种材料来源均排除内部安装验证记录。默认 `research` 范围仍排除固定案例任务。两种范围共用稳定的筛选与分页；切换材料来源不会把案例加入个人任务历史。

Example rows may include `example_cases`, a read-only projection of reviewed case labels from existing job/record pins. Associations require the stored capability, case and revision to match the relevant catalogue profile. Task-name similarity is never evidence of a case relationship. Multiple explicit case associations remain distinct; unsupported revisions are not relabelled as current studies. Example search considers confirmed case labels before paging, in the same read snapshot as rows/counts. The original task request is returned unchanged. Corrupt retained case metadata produces an explicit error, without exposing its raw body.

案例行可包含只读的 `example_cases` 信息，依据已有任务/记录的固定案例关联返回经过审阅的研究名称。关联要求保存的能力、案例和版本匹配对应目录；标题相似不能证明案例关系。多个明确关联分别保留，未支持版本不冒充当前研究。案例名称参与分页前搜索，且与结果及计数使用同一读取快照；原始任务请求保持不变。案例元数据损坏时明确报错，不返回原始内部内容。

`task-history-checks.yml` checks the request classification, personal/example boundary, immutable requests, older history, literal search, deterministic pagination, project filters and stale response rejection. Native Chromium checks cover English desktop and Chinese mobile, module navigation, failures/reconnection, task links, and unchanged archived pocket outputs. Cancelled transport fixtures exercise large histories; they are not scientific examples or calculated results. No owner scientific calculation is performed.
