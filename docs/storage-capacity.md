# Storage capacity / 存储容量

Windows installation and command entrypoints verify at least two GiB on the
installation and registered WSL backing drives before starting the distribution.
Offline status, stop and close return without booting a stopped distribution.
Windows 安装与命令入口在启动发行版前检查安装盘和 WSL 所在磁盘至少保留两 GiB；
已停止发行版的状态查询和关闭命令不会重新启动发行版。

All installation preflights, upload reservations and task write guards use one
available-space authority. On native Linux and Windows it reads the target
filesystem. On WSL it also reads the physical Windows volume containing the
registered distribution, using a read-only Windows Storage query. Effective
available space is the smaller boundary; Linux VHD capacity is never treated as
proof that the physical drive has room to grow.

安装预检、上传空间预留和任务写入保护共用同一容量检查。Linux 和 Windows
直接读取目标文件系统；WSL 同时通过只读查询检查已注册发行版所在的 Windows
物理磁盘，以更小的余量为准，不把虚拟磁盘内部容量视为宿主盘可以继续增长的证明。

The registration query has an eight-second deadline. After the real backing
volume is identified, a matching root DrvFS/Plan9 mount supplies fresh physical
capacity on every call. Mount metadata is inspected rather than assuming `/mnt/e`
or another fixed path. This avoids launching Windows Storage processes during
each scientific progress check. Unrepresentable mounts keep the bounded Windows
query with its one-second cache. Unknown or failed reads block new writes instead
of falling back to an older or virtual-only value. Health reporting returns `null`.
The probe never starts, stops, restarts, compacts or modifies a distribution.

注册位置查询限时八秒；确认真实物理盘后，通过实际匹配的 DrvFS/Plan9 根挂载逐次读取
最新容量，不假定挂载在 `/mnt/e`，也不在每次科学进度检查中启动 Windows Storage 进程。
无法表示为根挂载时仍使用限时查询与一秒缓存。无法确认容量时阻止新写入，不沿用过期
结果或仅依赖虚拟磁盘余量。状态接口将未知余量返回为 `null`。查询不启动、停止、重启、
压缩或修改任何发行版。

The existing deployment checkpoint enforces a four-GiB reserve during installation
and stops its own process through the existing lifecycle if space is insufficient.
Uninstall remains available to release space. The existing research worker checks
the configured reserve before starting and during execution, stopping only its
owned task while retaining partial files and diagnostics. Pending studies remain
queued while space is unavailable, with an explicit waiting reason. Upload interruption
retains confirmed chunks. These checks do not reserve disk capacity against other
applications, and do not provide automatic scientific-checkpoint continuation.

原部署检查点在安装中保留四 GiB 余量，不足时通过原生命周期停止自身安装进程；
卸载功能仍可用于释放空间。研究执行器在启动前和运行中检查配置的余量，仅停止
自身任务并保留部分文件及诊断。上传中断保留已确认的数据块；空间不足时尚未开始的
研究任务保留在队列中。这些检查不为其他应用预留或锁定磁盘容量，也不表示已经提供
科学检查点自动续跑。

Primary references: [Microsoft WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space)
and [Windows Get-Volume](https://learn.microsoft.com/en-us/powershell/module/storage/get-volume),
plus [WSL DrvFS and Plan9](https://wsl.dev/technical-documentation/drvfs/).
## Registered WSL volume identity

When the platform state directory is configured, a successful Windows registry
probe retains only the registered backing-volume identity in a private state
file. The binding includes the distribution, current Linux boot and observed
registered directory identity. Each later capacity check reads the live host
filesystem and retains the tighter physical/VHD limit; saved free-space numbers
are never an authority.

A new boot requires the original Windows producer again. Unsafe permissions,
foreign ownership, symbolic links, replaced directories and missing or ambiguous
host mounts fail closed. This permits ordinary restarts in the same boot when
Windows interoperability is temporarily unavailable.

For operator recovery, the packaged `wsl_storage.ps1` producer can run directly
on Windows for the actual registered distribution. Its fresh JSON observation
can be adopted inside that distribution with `WB_STATE_DIR` set to the real
platform state directory and
`python -m opendde_workbench.wsl_storage_identity --host-proof PATH`. The command
validates the current mount and registration directory, binds the observation to
this boot, and creates private identity metadata. It never starts WSL, changes a
disk configuration, accepts a supplied capacity as available space, or modifies research data.
