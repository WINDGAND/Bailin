/**
 * 将 pnpm / node-gyp / puppeteer 等原始安装日志归类为用户可读提示。
 * 纯函数模块，供 friendly-install 与单测复用。
 */

/** @typedef {{ id: string, title: string, body: string[] }} InstallHint */

/**
 * @param {string} log
 * @returns {InstallHint[]}
 */
export function diagnoseInstallError(log) {
  const text = String(log ?? "");
  const hints = [];

  if (
    /puppeteer/i.test(text) &&
    (/Failed to set up chrome/i.test(text) ||
      /PUPPETEER_SKIP_DOWNLOAD/i.test(text) ||
      /All providers failed for chrome/i.test(text) ||
      /browser folder .* exists but/i.test(text))
  ) {
    hints.push({
      id: "puppeteer-chrome",
      title: "Puppeteer 下载 Chrome 失败（可安全跳过）",
      body: [
        "这不影响运行 Bailin 桌宠。puppeteer 只用于开发辅助（截图 / 无障碍扫描）。",
        "请设置环境变量后重试：",
        '  PowerShell:  $env:PUPPETEER_SKIP_DOWNLOAD="true"; pnpm install',
        "  cmd:         set PUPPETEER_SKIP_DOWNLOAD=true && pnpm install",
        "若缓存目录损坏，可删除 %USERPROFILE%\\.cache\\puppeteer 后再装。",
        "本仓库默认已尽量跳过该下载；若仍触发，请用上面的环境变量。"
      ]
    });
  }

  if (
    /unable to verify the first certificate/i.test(text) ||
    (/prebuild-install/i.test(text) && /certificate/i.test(text))
  ) {
    hints.push({
      id: "tls-certificate",
      title: "下载预编译包时 HTTPS 证书校验失败",
      body: [
        "常见原因：公司代理、抓包软件、杀毒软件改写 HTTPS，或系统根证书不完整。",
        "可尝试：更换网络 / 临时关闭代理后再 pnpm install；",
        "或安装「使用 C++ 的桌面开发」工作负载，让本机编译代替下载预编译包。",
        "不建议长期关闭 Node 的 TLS 校验。"
      ]
    });
  }

  if (
    /better-sqlite3/i.test(text) ||
    /Could not find any Visual Studio/i.test(text) ||
    (/gyp ERR! find VS/i.test(text) && /Visual Studio/i.test(text)) ||
    (/node-gyp/i.test(text) && /Desktop development with C\+\+/i.test(text))
  ) {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    const body = [
      "Bailin 需要该原生模块才能读写本地数据，这一步失败则无法 pnpm dev。"
    ];
    if (nodeMajor >= 24) {
      body.push(
        `当前 Node 为 v${process.versions.node}（偏新）。预编译包可能尚未覆盖，更容易要求本机编译。`,
        "建议改用 Node.js 20 LTS 或 22 LTS：https://nodejs.org/"
      );
    }
    body.push(
      "若预编译包下载失败，需要本机编译。Windows 请安装 Visual Studio Build Tools，",
      "并勾选工作负载「使用 C++ 的桌面开发」：",
      "  https://visualstudio.microsoft.com/visual-cpp-build-tools/",
      "装好后重新打开终端，再执行 pnpm install（或 pnpm run setup）。",
      "只想使用产品、不想折腾源码时，请直接下载 Releases 安装包：",
      "  https://github.com/WINDGAND/Bailin/releases/latest"
    );

    hints.push({
      id: "better-sqlite3-native",
      title: "本地数据库模块 better-sqlite3 安装/编译失败",
      body
    });
  }

  if (/ELIFECYCLE|Failed in .* at .*node_modules/i.test(text) && hints.length === 0) {
    hints.push({
      id: "lifecycle-generic",
      title: "依赖的安装脚本失败",
      body: [
        "请向上滚动查看第一个带「ERR!」或「Error:」的段落，那才是根因。",
        "推荐使用仓库提供的安装入口（会自动跳过无关下载并给出说明）：",
        "  pnpm run setup",
        "仍失败时可改用 Node 20/22 LTS，或安装 VS Build Tools（C++ 桌面开发）。",
        "发行版安装包无需本地编译：https://github.com/WINDGAND/Bailin/releases/latest"
      ]
    });
  }

  if (hints.length === 0) {
    hints.push({
      id: "unknown",
      title: "安装失败（未能自动归类）",
      body: [
        "请保留完整终端输出以便排查。可先试：",
        "  1) 使用 Node 20 或 22 LTS（不要用过新的 Current）",
        "  2) pnpm run setup",
        "  3) Windows：安装 VS Build Tools +「使用 C++ 的桌面开发」",
        "或直接使用 Releases 安装包，无需源码编译。"
      ]
    });
  }

  return dedupeById(hints);
}

/**
 * @param {InstallHint[]} hints
 * @returns {string}
 */
/** 用于检测日志里是否已打印过本说明，避免 setup 与 wrapper 重复输出。 */
export const INSTALL_HINTS_BANNER = "Bailin · 安装失败说明";

export function formatInstallHints(hints) {
  const lines = [
    "",
    "════════════════════════════════════════════════════════════",
    `  ${INSTALL_HINTS_BANNER}（请往上看原始报错，下面是解读）`,
    "════════════════════════════════════════════════════════════",
    ""
  ];
  for (const hint of hints) {
    lines.push(`【${hint.title}】`);
    for (const line of hint.body) {
      lines.push(`  ${line}`);
    }
    lines.push("");
  }
  lines.push("════════════════════════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {InstallHint[]} hints
 */
function dedupeById(hints) {
  const seen = new Set();
  const out = [];
  for (const h of hints) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}
