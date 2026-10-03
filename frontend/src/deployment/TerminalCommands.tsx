const commands = [
  ["X-DDE UI", "启动并打开浏览器", "Start and open browser"],
  [
    "xdde dashboard",
    "同上，大小写均可",
    "Same on Windows; commands ignore case",
  ],
  [
    "xdde stop",
    "安全关闭；先暂停安装和计算",
    "Stop safely; pause installs and tasks first",
  ],
  [
    "xdde restart",
    "重启并应用计算配置",
    "Restart with updated compute configuration",
  ],
  ["xdde status", "查看服务状态", "Show service status"],
  ["xdde doctor", "检查系统依赖", "Check prerequisites"],
  ["xdde logs", "查看启动日志", "Read startup log"],
  [
    "xdde ui --no-auto-deploy",
    "启动但不自动创建安装任务",
    "Start without scheduling automatic installs",
  ],
];
export function TerminalCommands({ zh }: { zh: boolean }) {
  return (
    <details className="deployment-disclosure command-reference">
      <summary>
        <strong>{zh ? "常用终端命令" : "Terminal quick reference"}</strong>
      </summary>
      <dl>
        {commands.map(([cmd, cn, en]) => (
          <div key={cmd}>
            <dt>
              <code>{cmd}</code>
            </dt>
            <dd>{zh ? cn : en}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
