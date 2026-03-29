<div align="center">

# HX-CDN-Forge

**GitHub 文件 CDN 代理 + 大文件差分切片 + 多 CDN 并行下载**

一次 `reqByCDN()` 调用，自动处理一切

[![npm version](https://img.shields.io/npm/v/hx-cdn-forge.svg?style=flat-square)](https://www.npmjs.com/package/hx-cdn-forge)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-16.8%2B-61dafb?style=flat-square)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [CLI 切片工具](#cli-切片工具) • [API 文档](#api-文档) • [Tag 版本管理](#tag-版本管理)

</div>

---

## 功能特性

HX-CDN-Forge v2 专注于 **GitHub 文件的 CDN 代理加速**，提供对使用者完全透明的大文件支持。

### 🚀 核心能力

- **⚡ 透明请求** — `await reqByCDN("path")` 自动检测文件是否已切片，透明下载并拼接
- **✂️ 大文件差分切片** — CLI 工具将 >20MB 的文件切片，生成 `info.yaml` 清单 + `.cache.yaml` 增量缓存
- **🔥 多 CDN 并行下载** — 不同分片分配给不同 CDN 节点，动态负载均衡 + 任务窃取
- **🚀 极速模式 (Turbo)** — 同一分片从多个 CDN 同时请求，`Promise.any()` 取最快响应
- **🏷️ Tag 版本管理** — 通过 `bot-{commitId}-{timestamp}` tag 避免 jsDelivr 分支缓存失效
- **⚡ 实时延迟测速** — 自动测试所有 CDN 节点，选择最快的
- **💾 持久化存储** — 用户的节点选择自动保存到 localStorage
- **🛡️ TypeScript** — 完整类型定义
- **⚛️ React + 纯 JS** — `ForgeEngine` 可独立使用，也提供 React Context/Hooks

### 📦 内置 CDN 节点

| CDN 节点 | 地区 | 单文件限制 | 说明 |
|----------|------|-----------|------|
| **jsDelivr (Main)** | 全球 | 20 MB | jsDelivr 主节点 |
| **jsDelivr (Fastly)** | 全球 | 20 MB | Fastly CDN 加速 |
| **jsDelivr (Testing)** | 全球 | 20 MB | 测试节点 |
| **JSD Mirror** | 中国 | 20 MB | 腾讯云 EdgeOne 加速镜像 |
| **Zstatic** | 中国 | 20 MB | Zstatic CDN 镜像 |
| **GitHub Raw** | 全球 | 100 MB | GitHub 原始文件服务 |
| **Cloudflare Worker** | 全球 | 无限制 | 自定义 Worker 代理 |

> 💡 内置 6 个预设节点 + 支持自定义 Cloudflare Worker 代理节点。大于 20MB 的文件请使用 CLI 切片工具预处理。

---

## 快速开始

### 安装

```bash
npm install hx-cdn-forge
# 或
pnpm add hx-cdn-forge
```

### 基础使用 (React)

```tsx
import { CDNProvider, useCDNUrl, useReqByCDN, createForgeConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/styles.css';

// 推荐使用 tag 避免 jsDelivr 缓存问题
const config = createForgeConfig({
  user: 'HengXin666',
  repo: 'my-assets',
  ref: 'bot-a1b2c3-20260329',
});

function App() {
  return (
    <CDNProvider config={config}>
      <MyContent />
    </CDNProvider>
  );
}

function MyContent() {
  // 小文件: 直接获取 URL
  const imgUrl = useCDNUrl('screenshots/demo.png');

  // 大文件 / 任意文件: 透明请求
  const reqByCDN = useReqByCDN();

  const handleLoad = async () => {
    const result = await reqByCDN('static/ass/loli.ass', (p) => {
      console.log(`${p.percentage}% | ${(p.speed / 1024 / 1024).toFixed(1)} MB/s`);
    });
    // result.blob — 完整文件 (无论原文件是否切片)
    const text = await result.blob.text();
  };

  return (
    <div>
      <img src={imgUrl} alt="demo" />
      <button onClick={handleLoad}>加载大文件</button>
    </div>
  );
}
```

### 基础使用 (纯 JS / Node)

```ts
import { ForgeEngine, createForgeConfig } from 'hx-cdn-forge';

const config = createForgeConfig(
  { user: 'HengXin666', repo: 'my-assets', ref: 'bot-a1b2c3-20260329' },
  {
    splitStoragePath: 'static/cdn-black',
    mappingPrefix: 'static',
    turboMode: true,          // 开启极速模式
    turboConcurrentCDNs: 3,   // 每个分片同时请求 3 个 CDN
  },
);

const engine = new ForgeEngine(config);
await engine.initialize();

// 透明请求 — 自动检测切片
const result = await engine.reqByCDN('static/ass/loli.ass', (p) => {
  console.log(`${p.percentage}% | ETA: ${p.eta.toFixed(1)}s`);
});

console.log(`下载完成: ${result.totalSize} bytes, 耗时 ${result.totalTime.toFixed(0)}ms`);
console.log(`使用切片模式: ${result.usedSplitMode}`);
console.log(`使用并行模式: ${result.usedParallelMode}`);
```

---

## CLI 切片工具

对于超过 CDN 节点单文件限制 (默认 20MB) 的大文件，需要先用 CLI 工具进行切片。

### 安装 & 使用

```bash
# 全局安装后直接使用
npm install -g hx-cdn-forge
hx-cdn-split --help

# 或通过 npx
npx hx-cdn-split --help
```

### 基本用法

```bash
# 将 25MB 的 ASS 文件切片
hx-cdn-split \
  --source static/ass/loli.ass \
  --output static/cdn-black \
  --prefix static

# 使用自定义切片大小
hx-cdn-split -s data/big.bin -o cdn-data -p data -c 10MB

# 强制重新生成 (忽略缓存)
hx-cdn-split -s static/ass/loli.ass -o static/cdn-black -p static -f
```

### 参数说明

| 参数 | 短写 | 必填 | 说明 |
|------|------|------|------|
| `--source` | `-s` | ✅ | 源文件路径 |
| `--output` | `-o` | ✅ | 输出存储根目录 |
| `--prefix` | `-p` | ❌ | 映射前缀 (从 source 路径去除) |
| `--chunk-size` | `-c` | ❌ | 切片大小，默认 `19MB`。支持 B/KB/MB/GB 后缀 |
| `--force` | `-f` | ❌ | 强制重新生成，忽略 `.cache.yaml` |
| `--help` | `-h` | — | 显示帮助 |

### 切片存储结构

```
仓库根目录/
├── static/
│   └── ass/
│       └── loli.ass          ← 源文件 (25MB)
│
└── static/cdn-black/         ← splitStoragePath (配置的存储路径)
    └── ass/
        └── loli.ass/         ← 映射目录 (去除了 "static" 前缀)
            ├── 0-loli.ass    ← 切片 0 (19MB)
            ├── 1-loli.ass    ← 切片 1 (6MB)
            ├── info.yaml     ← 切片清单
            └── .cache.yaml   ← 源文件哈希 (增量更新检测)
```

### info.yaml 示例

```yaml
originalName: loli.ass
totalSize: 26214400
mimeType: text/x-ssa
chunkSize: 19922944
createdAt: 2026-03-29T08:00:00.000Z
chunks:
  - fileName: 0-loli.ass
    index: 0
    size: 19922944
    sha256: a1b2c3...
  - fileName: 1-loli.ass
    index: 1
    size: 6291456
    sha256: d4e5f6...
```

### 增量更新

CLI 工具会在输出目录生成 `.cache.yaml`，记录源文件的路径和 SHA-256 哈希。再次运行时：

- **源文件未变化** → 自动跳过，输出 `⏭️ 源文件未变化，跳过`
- **源文件已变化** → 重新生成所有切片
- **使用 `--force`** → 无条件重新生成

推荐在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "cdn:split": "hx-cdn-split -s static/ass/loli.ass -o static/cdn-black -p static"
  }
}
```

---

## 透明请求原理

`reqByCDN(filePath)` 的内部流程：

```
reqByCDN("static/ass/loli.ass")
        │
        ▼
┌─────────────────────────┐
│ 1. 计算 info.yaml 路径  │
│    splitStoragePath +    │
│    mapPath(filePath)     │
│    + "/info.yaml"        │
└────────────┬────────────┘
             │
             ▼
     ┌───────────────┐
     │ 2. 请求 CDN   │
     │  获取 info.yaml│
     └───────┬───────┘
             │
      ┌──────┴──────┐
      │             │
   200 OK        404
      │             │
      ▼             ▼
┌───────────┐ ┌──────────────┐
│ 3A. 解析  │ │ 3B. 直接下载 │
│ info.yaml │ │ 原始文件     │
│ 并行下载  │ │ (单文件模式) │
│ 各切片    │ └──────────────┘
│ → 拼接    │
└───────────┘
      │
      ▼
  DownloadResult
  { blob, totalSize, usedSplitMode, ... }
```

**对调用者完全透明** — 无论文件是否切片，API 调用方式完全相同。

---

## 多 CDN 并行下载

### 标准模式

不同分片分配给不同 CDN 节点，充分利用多路带宽：

```
文件: big.bin (38MB, 切片为 2 块)

  切片 0 (19MB) ─── jsDelivr Main   ────→ ███████████ 完成 1.2s
  切片 1 (19MB) ─── JSD Mirror     ────→ ███████████ 完成 0.9s
                                          ↓
                                   Blob 拼接 → 完整文件
```

特性：
- **EWMA 速度估计** — 实时追踪各节点下载速度
- **动态负载均衡** — 更多任务分配给更快的节点
- **任务窃取** — 快速节点完成后自动接管慢速节点的待执行任务

### 极速模式 (Turbo Mode)

同一分片同时从多个 CDN 请求，`Promise.any()` 取最快响应：

```
切片 0 (19MB):
  ├── jsDelivr Main   ────→ ███████ 最先完成 ✅ → 采用
  ├── JSD Mirror     ────→ █████████ (abort)
  └── Zstatic        ────→ ████████████ (abort)

切片 1 (19MB):
  ├── jsDelivr Main   ────→ ██████████ (abort)
  ├── JSD Mirror     ────→ ██████ 最先完成 ✅ → 采用
  └── Zstatic        ────→ █████████████ (abort)
```

**牺牲带宽换取最低延迟**，适合对加载速度有极致要求的场景。

开启极速模式：

```ts
const config = createForgeConfig(
  { user: '...', repo: '...', ref: '...' },
  {
    splitStoragePath: 'static/cdn-black',
    mappingPrefix: 'static',
    turboMode: true,          // 开启极速模式
    turboConcurrentCDNs: 3,   // 每个分片同时请求 3 个 CDN
  },
);
```

---

## Tag 版本管理

### 问题

jsDelivr 对分支 (如 `main`) 的缓存时间很长。当文件内容更新后，CDN 可能长时间返回旧数据。

使用 commit hash 作为 ref 需要 **两次 git 提交**：
1. 第一次提交数据 (才能获取 commit hash)
2. 第二次提交 hash 到配置中

### 解决方案

使用 `bot-{shortCommitId}-{timestamp}` 格式的 tag，配合 GitHub Actions 自动管理：

```
推送到 main 分支
        │
        ▼
  GitHub Actions
        │
        ├── 创建 tag: bot-a1b2c3-20260329160000
        │
        └── 保留最新 2 个 tag，删除更旧的
```

**只需一次 git 提交**，流水线自动创建带有当前 commit hash 的 tag。

### 配置 GitHub Actions

在仓库中添加 `.github/workflows/cdn-tag.yml`：

```yaml
name: CDN Tag Manager

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  create-cdn-tag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Create and manage CDN tags
        run: |
          SHORT_SHA=$(git rev-parse --short HEAD)
          TIMESTAMP=$(date +%Y%m%d%H%M%S)
          NEW_TAG="bot-${SHORT_SHA}-${TIMESTAMP}"

          # 创建新 tag
          git tag "${NEW_TAG}"
          git push origin "${NEW_TAG}"

          # 只保留最新 2 个 bot- tag
          BOT_TAGS=$(git tag -l 'bot-*' --sort=-creatordate)
          TAG_COUNT=$(echo "${BOT_TAGS}" | grep -c '^bot-' || true)

          if [ "${TAG_COUNT}" -gt 2 ]; then
            echo "${BOT_TAGS}" | tail -n +3 | while IFS= read -r tag; do
              [ -n "${tag}" ] && git push origin --delete "${tag}" 2>/dev/null || true
              [ -n "${tag}" ] && git tag -d "${tag}" 2>/dev/null || true
            done
          fi

          echo "✅ CDN tag: ${NEW_TAG}"
```

### 使用 tag

```ts
const config = createForgeConfig({
  user: 'HengXin666',
  repo: 'my-assets',
  ref: 'bot-a1b2c3-20260329160000', // 使用 tag 而非分支名
});
```

---

## API 文档

### `createForgeConfig(github, options?)`

创建配置对象。

```ts
import { createForgeConfig } from 'hx-cdn-forge';

const config = createForgeConfig(
  // GitHub 仓库信息 (必填)
  {
    user: 'HengXin666',
    repo: 'my-assets',
    ref: 'bot-a1b2c3-20260329', // branch / tag / commit hash
  },
  // 可选配置
  {
    // --- 切片相关 ---
    splitStoragePath: 'static/cdn-black', // 切片存储根路径
    mappingPrefix: 'static',              // 路径映射前缀
    splitThreshold: 20 * 1024 * 1024,     // 切片阈值 (默认 20MB)

    // --- 节点相关 ---
    nodes: undefined,          // 自定义节点列表 (默认使用内置 6 个)
    defaultNodeId: undefined,  // 默认节点 ID (默认自动测速选择)
    autoTest: true,            // 初始化时自动测速

    // --- 测速 ---
    testTimeout: 5000,   // 测速超时 (ms)
    testRetries: 2,      // 测速重试次数

    // --- 并行下载 ---
    maxConcurrency: 6,     // 最大并发数
    chunkTimeout: 30000,   // 单分片超时 (ms)
    maxRetries: 3,         // 单分片重试次数
    enableWorkStealing: true, // 任务窃取

    // --- 极速模式 ---
    turboMode: false,        // 是否开启极速模式
    turboConcurrentCDNs: 3,  // 极速模式下同时请求的 CDN 数量

    // --- 持久化 ---
    storageKey: 'hx-cdn-forge-node', // localStorage 键名
  },
);
```

### `ForgeEngine`

核心引擎类，独立于 React，可在任何 JS 环境使用。

```ts
import { ForgeEngine } from 'hx-cdn-forge';

const engine = new ForgeEngine(config);

// 初始化 (自动测速 + 选择最快节点)
await engine.initialize();

// 透明请求
const result = await engine.reqByCDN('static/ass/loli.ass', onProgress);

// URL 构建 (小文件)
const url = engine.buildUrl('screenshots/demo.png');

// 节点管理
engine.getNodes();                  // 获取所有节点
engine.getCurrentNode();            // 获取当前节点
engine.selectNode('jsd-mirror');    // 手动选择节点
engine.getSortedNodes();            // 按延迟排序的节点

// 测速
await engine.testAllNodes();
await engine.testAndSelectBest();
await engine.testAllNodesStreaming((result) => { /* 流式回调 */ });

// 其他
engine.getConfig();            // 获取规范化后的配置
engine.isInitialized();        // 是否已初始化
engine.clearSplitInfoCache();  // 清除 info.yaml 缓存
```

### `DownloadResult`

`reqByCDN()` 返回的结果对象：

```ts
interface DownloadResult {
  blob: Blob;                     // 完整文件数据
  arrayBuffer: () => Promise<ArrayBuffer>;
  totalSize: number;              // 文件大小 (字节)
  totalTime: number;              // 耗时 (毫秒)
  contentType: string;            // MIME 类型
  usedSplitMode: boolean;         // 是否使用了切片下载
  usedParallelMode: boolean;      // 是否使用了并行模式
  nodeContributions: Map<string, {
    bytes: number;
    chunks: number;
    avgSpeed: number;
  }>;
}
```

### `DownloadProgress`

进度回调参数：

```ts
interface DownloadProgress {
  loaded: number;          // 已下载字节
  total: number;           // 总字节
  percentage: number;      // 百分比 (0-100)
  speed: number;           // 当前速度 (字节/秒)
  eta: number;             // 预估剩余时间 (秒)
  completedChunks: number; // 已完成分片数
  totalChunks: number;     // 总分片数
}
```

### CDN 节点预设 & 工具

```ts
import {
  CDN_NODE_PRESETS,
  DEFAULT_GITHUB_CDN_NODES,
  createWorkerNode,
  CDNTester,
  getSortedNodesWithLatency,
} from 'hx-cdn-forge';

// 预设节点
CDN_NODE_PRESETS.jsdelivr_main    // jsDelivr 主节点
CDN_NODE_PRESETS.jsdelivr_fastly  // jsDelivr Fastly
CDN_NODE_PRESETS.jsdelivr_testing // jsDelivr Testing
CDN_NODE_PRESETS.jsd_mirror       // JSD Mirror (中国)
CDN_NODE_PRESETS.zstatic          // Zstatic (中国)
CDN_NODE_PRESETS.github_raw       // GitHub Raw

// 默认节点列表 (以上 6 个)
DEFAULT_GITHUB_CDN_NODES

// 创建 Cloudflare Worker 代理节点
const workerNode = createWorkerNode('your-worker.workers.dev');

// 独立测速工具
const tester = new CDNTester(5000, 2);
const results = await tester.testAll(nodes);
const bestId = tester.getBestNodeId(results);
```

### Manifest 工具

解析和序列化 `info.yaml` / `.cache.yaml` 的轻量级工具 (无外部依赖)：

```ts
import {
  parseInfoYaml,
  serializeInfoYaml,
  parseCacheYaml,
  serializeCacheYaml,
} from 'hx-cdn-forge';

const info = parseInfoYaml(yamlText);   // string → SplitInfo
const yaml = serializeInfoYaml(info);   // SplitInfo → string

const cache = parseCacheYaml(yamlText); // string → SplitCache
const cYaml = serializeCacheYaml(cache); // SplitCache → string
```

---

## React API

### `<CDNProvider>`

```tsx
import { CDNProvider, createForgeConfig } from 'hx-cdn-forge';

const config = createForgeConfig({
  user: 'HengXin666',
  repo: 'my-assets',
  ref: 'bot-a1b2c3-20260329',
});

<CDNProvider
  config={config}
  onInitialized={(node) => console.log('就绪:', node?.name)}
  onNodeChange={(node) => console.log('切换到:', node.name)}
>
  <App />
</CDNProvider>
```

### `useCDN()`

获取完整的 CDN Context：

```tsx
const {
  config,           // ForgeConfig
  currentNode,      // CDNNode | null
  nodes,            // CDNNodeWithLatency[]
  isTesting,        // boolean
  isInitialized,    // boolean
  latencyResults,   // Map<string, LatencyResult>
  selectNode,       // (nodeId: string) => void
  testAllNodes,     // () => Promise<LatencyResult[]>
  reqByCDN,         // (path, onProgress?) => Promise<DownloadResult>
  buildUrl,         // (path) => string
  getSortedNodes,   // () => CDNNodeWithLatency[]
} = useCDN();
```

### `useReqByCDN()`

获取透明请求函数：

```tsx
const reqByCDN = useReqByCDN();

const result = await reqByCDN('static/ass/loli.ass', (p) => {
  console.log(`${p.percentage}% | ${(p.speed / 1024 / 1024).toFixed(1)} MB/s`);
});
// result.blob — 完整文件
```

### `useCDNUrl(path)`

获取小文件的 CDN URL：

```tsx
const url = useCDNUrl('screenshots/demo.png');
// → "https://cdn.jsdelivr.net/gh/user/repo@ref/screenshots/demo.png"
```

### `useCurrentCDNNode()`

获取当前选中的 CDN 节点：

```tsx
const node = useCurrentCDNNode();
console.log(node?.name); // "jsDelivr (Main)"
```

### `useCDNStatus()`

`useCDN()` 的别名，获取完整状态。

### `<CDNNodeSelector>`

可视化节点选择器组件：

```tsx
import { CDNNodeSelector } from 'hx-cdn-forge';
import 'hx-cdn-forge/styles.css';

<CDNNodeSelector
  showLatency={true}
  showRegion={true}
  showRefreshButton={true}
  compact={false}
  title="CDN 节点"
  onChange={(node) => console.log('选择:', node.name)}
  onTestComplete={(results) => console.log('测速完成:', results)}
/>
```

---

## 完整配置示例

### 基础配置 (自动测速)

```ts
const config = createForgeConfig({
  user: 'HengXin666',
  repo: 'my-assets',
  ref: 'bot-a1b2c3-20260329',
});
```

### 带切片的配置

```ts
const config = createForgeConfig(
  { user: 'HengXin666', repo: 'my-assets', ref: 'bot-a1b2c3-20260329' },
  {
    splitStoragePath: 'static/cdn-black',
    mappingPrefix: 'static',
  },
);
```

### 极速模式 + 自定义节点

```ts
import { CDN_NODE_PRESETS, createWorkerNode, createForgeConfig } from 'hx-cdn-forge';

const config = createForgeConfig(
  { user: 'HengXin666', repo: 'my-assets', ref: 'bot-a1b2c3-20260329' },
  {
    splitStoragePath: 'static/cdn-black',
    mappingPrefix: 'static',
    turboMode: true,
    turboConcurrentCDNs: 3,
    nodes: [
      CDN_NODE_PRESETS.jsdelivr_main,
      CDN_NODE_PRESETS.jsdelivr_fastly,
      CDN_NODE_PRESETS.jsd_mirror,
      CDN_NODE_PRESETS.zstatic,
      createWorkerNode('my-proxy.workers.dev'),
    ],
  },
);
```

---

## 项目结构

```
src/
├── types.ts                     # 统一类型定义
├── index.ts                     # 入口导出
├── core/
│   ├── config.ts                # 配置默认值 + 工厂
│   ├── cdnNodes.ts              # CDN 节点预设 + 测速工具
│   ├── manifest.ts              # info.yaml / .cache.yaml 解析器
│   ├── chunkedFetcher.ts        # 多 CDN 并行分块下载引擎
│   └── fetcher.ts               # ForgeEngine 核心引擎
├── cli/
│   └── split.ts                 # CLI 切片工具 (hx-cdn-split)
└── react/
    ├── CDNContext.tsx            # Provider + Hooks
    └── CDNNodeSelector/
        ├── index.tsx            # 节点选择器组件
        └── styles.css           # 组件样式
```

---

## 浏览器支持

- Chrome / Edge: 最新 2 个版本
- Firefox: 最新 2 个版本
- Safari: 最新 2 个版本
- 需要 `fetch`、`ReadableStream`、`Promise.any` 支持 (ES2021+)

---

## 开发

```bash
git clone https://github.com/HengXin666/HX-CDN-Forge.git
cd HX-CDN-Forge
npm install

npm run build       # 构建
npm run dev         # 启动开发服务器
npm run type-check  # 类型检查
npm test            # 运行测试
```

---

## License

MIT © HX

---

## 致谢

- [jsDelivr](https://www.jsdelivr.com/) — 开源 CDN 服务
- [JSD Mirror](https://cdn.jsdmirror.com/) — jsDelivr 中国镜像
- [Cloudflare Workers](https://workers.cloudflare.com/) — 无服务器平台

---

<div align="center">

**[⬆ 返回顶部](#hx-cdn-forge)**

Made with ❤️ by HX

</div>
