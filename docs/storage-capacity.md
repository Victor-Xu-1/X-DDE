# Storage capacity / 存储容量

All installation preflights, upload reservations and task write guards use one
available-space authority. On native Linux and Windows it reads the target
filesystem. On WSL it also reads the physical Windows volume containing the
registered distribution, using a read-only Windows Storage query. Effective
available space is the smaller boundary; Linux VHD capacity is never treated as
proof that the physical drive has room to grow.

安装预检、上传空间预留和任务写入保护共用同一容量检查。Linux 和 Windows
直接读取目标文件系统；WSL 同时通过只读查询检查已注册发行版所在的 Windows
物理磁盘，以更小的余量为准，不把虚拟磁盘内部容量视为宿主盘可以继续增长的证明。

The host lookup has an eight-second deadline and a one-second cache. Unknown or
failed host queries block new writes instead of falling back to an older or
virtual-only value. Health reporting returns `null` for unavailable capacity.
The probe never starts, stops, restarts, compacts or modifies a distribution.

宿主查询限时八秒，缓存有效期一秒；无法确认容量时阻止新写入，不沿用过期结果或
仅依赖虚拟磁盘余量。状态接口将未知余量返回为 `null`。查询不启动、停止、重启、
压缩或修改任何发行版。

The existing deployment checkpoint enforces a four-GiB reserve during installation
and stops its own process through the existing lifecycle if space is insufficient.
Uninstall remains available to release space. The existing research worker checks
the configured reserve before starting and during execution, stopping only its
owned task while retaining partial files and diagnostics. Upload interruption
retains confirmed chunks. These checks do not reserve disk capacity against other
applications, and do not provide automatic scientific-checkpoint continuation.

原部署检查点在安装中保留四 GiB 余量，不足时通过原生命周期停止自身安装进程；
卸载功能仍可用于释放空间。研究执行器在启动前和运行中检查配置的余量，仅停止
自身任务并保留部分文件及诊断。上传中断保留已确认的数据块。这些检查不为其他应用
预留或锁定磁盘容量，也不表示已经提供科学检查点自动续跑。

Primary references: [Microsoft WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space)
and [Windows Get-Volume](https://learn.microsoft.com/en-us/powershell/module/storage/get-volume).
