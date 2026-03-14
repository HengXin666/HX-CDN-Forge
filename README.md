<div align="center">

# HX-CDN-Forge

**一个灵活的 React + TypeScript CDN 节点选择器**

支持 GitHub、Cloudflare、NPM 和自定义 CDN 源

[![npm version](https://img.shields.io/npm/v/hx-cdn-forge.svg?style=flat-square)](https://www.npmjs.com/package/hx-cdn-forge)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb?style=flat-square)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [使用场景](#使用场景) • [API 文档](#api-文档) • [示例](#示例)

</div>

---

## 功能特性

HX-CDN-Forge 是一个灵活的 CDN 智能选择器, 支持多种 CDN 源类型, 解决了静态资源访问不稳定的问题。

### 🚀 核心功能

- **⚡ 实时延迟测速** - 自动测试所有配置的 CDN 节点延迟
- **🎯 智能节点选择** - 首次加载自动选择延迟最低的节点
- **🔄 用户手动切换** - 提供可视化界面, 支持用户手动选择节点
- **📊 延迟排序显示** - 节点按延迟时间排序, 一目了然
- **💾 持久化存储** - 用户选择自动保存, 下次访问自动恢复
- **🛡️ TypeScript 支持** - 完整的类型定义, 开发体验友好
- **🌏 多源支持** - 支持 GitHub、Cloudflare Workers、NPM、自定义 CDN

### 🔥 并行分块加载(大文件加速)

针对 10MB~20MB+ 的大文件场景, HX-CDN-Forge 提供了基于 HTTP Range Request 的**多 CDN 并行分块下载**能力:

- **多节点并行** - 同一文件的不同分块分配给不同 CDN 节点同时下载
- **动态负载均衡** - 基于 EWMA 实时速度估计, 自动将更多分块分配给更快的节点
- **任务窃取** - 快速节点完成自己的分块后, 自动接管慢速节点的待执行任务
- **自适应降级** - 自动探测 Range 支持; 不支持时回退到单连接下载
- **智能分块** - 默认 2MB 分块, 可配置; 小文件自动跳过分块
- **进度追踪** - 实时回报下载进度、速度、ETA 和各节点贡献

### 📦 支持的 CDN 源类型

| 源类型 | 说明 | 预设节点 |
|-------|------|---------|
| **GitHub** | GitHub 仓库资源(raw files、releases、archives) | jsDelivr、JSD Mirror、Zstatic、GitHub Raw |
| **Cloudflare** | Cloudflare Workers 代理 GitHub 资源 | 自定义 Worker 域名 |
| **NPM** | NPM 包资源 | jsDelivr、unpkg、esm.sh |
| **Custom** | 完全自定义 CDN 配置 | 自定义 URL 构建逻辑 |

### 📏 各 CDN 节点文件大小限制与 Range 支持

| CDN 节点 | 单文件大小限制 | 支持 Range Request | 备注 |
|----------|-------------|-------------------|------|
| **jsDelivr (Main/Fastly/Testing)** | 20 MB | ✅ 支持 | 超限返回 403; GitHub 仓库总体 50MB |
| **JSD Mirror** | 20 MB | ✅ 支持 | 继承 jsDelivr 限制, 腾讯云 EdgeOne 加速 |
| **Zstatic** | 20 MB | ✅ 支持 | 继承 jsDelivr 限制, 镜像回源 |
| **GitHub Raw** | 100 MB | ✅ 支持 | Git 推送单文件限制, 有速率限制 |
| **unpkg** | ~20 MB | ✅ 支持 | NPM 包大小限制 |
| **esm.sh** | ~20 MB | ✅ 支持 | ESM 模块 CDN |
| **Cloudflare Workers** | 无限制 | ✅ 支持 | 流式传输, 无响应体大小限制 |

> 💡 **大文件建议**: 对于 10MB+ 的文件, 推荐使用并行分块下载功能, 充分利用多个 CDN 节点的带宽。

---

## 快速开始

### 安装

```bash
npm install hx-cdn-forge
# 或
yarn add hx-cdn-forge
# 或
pnpm add hx-cdn-forge
```

---

## 使用场景

### 场景 1: GitHub 资源加速

加速访问 GitHub 仓库中的文件(图片、音频、视频等)。

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createGitHubCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  const config = createGitHubCDNConfig({
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main', // 或使用 commit hash
  });

  return (
    <CDNProvider config={config}>
      <CDNNodeSelector />
      <MyContent />
    </CDNProvider>
  );
}

function MyContent() {
  const getCdnUrl = useCDNUrl();

  return (
    <div>
      <img src={getCdnUrl('/screenshots/initial-load.png')} alt="截图" />
      <audio src={getCdnUrl('/music/song.mp3')} controls />
    </div>
  );
}
```

**预设的 GitHub CDN 节点**:
- jsDelivr (Main) - 全球节点
- jsDelivr (Fastly) - Fastly CDN
- jsDelivr (Testing) - 测试节点
- JSD Mirror - 中国大陆镜像
- Zstatic - 中国大陆镜像
- GitHub Raw - 官方源

---

### 场景 2: Cloudflare Workers 代理 GitHub

使用 Cloudflare Workers 代理 GitHub 资源, 在中国大陆访问速度更快。

**步骤 1: 部署 gh-proxy 到 Cloudflare Workers**

```bash
# 1. 访问 https://workers.cloudflare.com/
# 2. 创建 Worker
# 3. 复制 gh-proxy 代码(https://github.com/hadis898/gh-proxy)
# 4. 部署后获得域名, 例如: your-worker.workers.dev
```

**步骤 2: 在项目中使用**

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createCloudflareCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  const config = createCloudflareCDNConfig({
    workerDomain: 'your-worker.workers.dev', // 你的 Worker 域名
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main',
  });

  return (
    <CDNProvider config={config}>
      <CDNNodeSelector />
      <MyContent />
    </CDNProvider>
  );
}

function MyContent() {
  const getCdnUrl = useCDNUrl();

  // 使用方式与 GitHub CDN 相同
  return <img src={getCdnUrl('/screenshots/initial-load.png')} alt="截图" />;
}
```

**Cloudflare Workers 优势**:
- 完全免费(每天 10 万次请求)
- 无需服务器
- 自带全球 CDN 加速
- 在中国大陆访问速度快
- 支持所有 GitHub 资源类型

---

### 场景 3: NPM 包资源加速

加速访问 NPM 包中的文件。

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createNPMCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  const config = createNPMCDNConfig({
    npmPackage: 'react',
    npmVersion: '18.2.0', // 可选, 默认 latest
  });

  return (
    <CDNProvider config={config}>
      <CDNNodeSelector />
      <MyContent />
    </CDNProvider>
  );
}

function MyContent() {
  const getCdnUrl = useCDNUrl();

  // 获取 React 包中的文件
  return <script src={getCdnUrl('/umd/react.production.min.js')} />;
}
```

**预设的 NPM CDN 节点**:
- jsDelivr (NPM)
- unpkg
- esm.sh

---

### 场景 4: 混合多种 CDN 源

在一个应用中混合使用多种 CDN 源。

```tsx
import {
  CDNProvider,
  CDNNodeSelector,
  useCDNUrl,
  createMixedCDNConfig,
  CDN_NODE_TEMPLATES,
} from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  // 创建自定义节点列表
  const customNodes = [
    // GitHub CDN 节点
    CDN_NODE_TEMPLATES.github.jsd_mirror,
    CDN_NODE_TEMPLATES.github.zstatic,

    // Cloudflare Worker 节点
    CDN_NODE_TEMPLATES.cloudflare.createWorkerNode('your-worker.workers.dev'),

    // NPM CDN 节点
    CDN_NODE_TEMPLATES.npm.unpkg,

    // 完全自定义节点
    {
      id: 'my-custom-cdn',
      name: '我的自定义 CDN',
      baseUrl: 'https://cdn.example.com',
      region: 'china',
      sourceType: 'custom',
      buildUrl: (baseUrl, resourcePath, context) => {
        // 自定义 URL 构建逻辑
        return `${baseUrl}${resourcePath}`;
      },
    },
  ];

  const config = createMixedCDNConfig({
    nodes: customNodes,
    context: {
      githubUser: 'HengXin666',
      githubRepo: 'HX-CDN-Forge',
      githubRef: 'main',
      npmPackage: 'react',
      npmVersion: '18.2.0',
    },
  });

  return (
    <CDNProvider config={config}>
      <CDNNodeSelector />
      <MyContent />
    </CDNProvider>
  );
}
```

---

### 场景 5: 完全自定义 CDN

构建完全自定义的 CDN 配置。

```tsx
import { CDNProvider, CDNNode, createMixedCDNConfig } from 'hx-cdn-forge';

const customNodes: CDNNode[] = [
  {
    id: 'aliyun-oss',
    name: '阿里云 OSS',
    baseUrl: 'https://your-bucket.oss-cn-beijing.aliyuncs.com',
    region: 'china',
    sourceType: 'custom',
    buildUrl: (baseUrl, resourcePath) => {
      const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
      return `${baseUrl}${cleanPath}`;
    },
  },
  {
    id: 'tencent-cos',
    name: '腾讯云 COS',
    baseUrl: 'https://your-bucket.cos.ap-guangzhou.myqcloud.com',
    region: 'china',
    sourceType: 'custom',
    buildUrl: (baseUrl, resourcePath) => {
      const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
      return `${baseUrl}${cleanPath}`;
    },
  },
];

const config = createMixedCDNConfig({
  nodes: customNodes,
  context: {
    customConfig: {
      // 自定义配置
      enableAuth: true,
      authToken: 'xxx',
    },
  },
});
```

---

### 场景 6: 并行分块下载大文件

对于 10MB~20MB+ 的大文件, 使用多 CDN 并行分块下载显著提升速度。

**React Hook 方式:**

```tsx
import { CDNProvider, useCDNChunkedDownload, createGitHubCDNConfig } from 'hx-cdn-forge';

function App() {
  const config = createGitHubCDNConfig({
    user: 'HengXin666',
    repo: 'HX-CDN-Forge',
    ref: 'main',
  });

  return (
    <CDNProvider config={config}>
      <LargeFileDownloader />
    </CDNProvider>
  );
}

function LargeFileDownloader() {
  const chunkedDownload = useCDNChunkedDownload();
  const [progress, setProgress] = useState({ percentage: 0, speed: 0 });

  const handleDownload = async () => {
    const result = await chunkedDownload('/assets/large-model.bin', (p) => {
      setProgress({
        percentage: p.percentage,
        speed: p.speed / 1024 / 1024, // MB/s
      });
    });

    // result.blob 是完整的文件 Blob
    const url = URL.createObjectURL(result.blob);
    console.log(`下载完成! ${result.totalSize} bytes in ${result.totalTime}ms`);
    console.log(`使用并行模式: ${result.usedParallelMode}`);

    // 查看各节点贡献
    for (const [nodeId, contrib] of result.nodeContributions) {
      console.log(`${nodeId}: ${contrib.chunks} chunks, ${contrib.bytes} bytes`);
    }
  };

  return (
    <div>
      <button onClick={handleDownload}>下载大文件</button>
      <p>进度: {progress.percentage}% | 速度: {progress.speed.toFixed(1)} MB/s</p>
    </div>
  );
}
```

**直接使用 ChunkedLoader(无需 React):**

```ts
import { ChunkedLoader, CDN_NODE_TEMPLATES } from 'hx-cdn-forge';

const loader = new ChunkedLoader({
  chunkSize: 2 * 1024 * 1024,  // 2MB 分块
  maxConcurrency: 6,            // 最大 6 个并发连接
  enableWorkStealing: true,     // 启用任务窃取
});

const nodes = [
  CDN_NODE_TEMPLATES.github.jsdelivr_main,
  CDN_NODE_TEMPLATES.github.jsdelivr_fastly,
  CDN_NODE_TEMPLATES.github.github_raw,
];

const context = { githubUser: 'HengXin666', githubRepo: 'my-repo', githubRef: 'main' };

const result = await loader.download(
  nodes,
  (node, path, ctx) => node.buildUrl(node.baseUrl, path, ctx),
  '/large-file.zip',
  context,
  undefined, // latency results (optional)
  (progress) => console.log(`${progress.percentage}%`),
);
```

**工作原理:**

```
文件: large-file.bin (15MB)
  ├── Chunk 0 (0-2MB)   → jsDelivr Main   [===========] 完成 320ms
  ├── Chunk 1 (2-4MB)   → jsDelivr Fastly [===========] 完成 280ms
  ├── Chunk 2 (4-6MB)   → GitHub Raw      [===========] 完成 450ms
  ├── Chunk 3 (6-8MB)   → jsDelivr Main   [===========] 完成 310ms  ← 动态再分配
  ├── Chunk 4 (8-10MB)  → jsDelivr Fastly [===========] 完成 290ms
  ├── Chunk 5 (10-12MB) → jsDelivr Main   [===========] 完成 300ms  ← 任务窃取
  ├── Chunk 6 (12-14MB) → jsDelivr Fastly [===========] 完成 285ms
  └── Chunk 7 (14-15MB) → jsDelivr Main   [===========] 完成 150ms
                                           ↓
                                     Blob 重组 → 完整文件
```

---

## API 文档

### 配置创建函数

#### `createGitHubCDNConfig(options)`

创建 GitHub CDN 配置。

```typescript
const config = createGitHubCDNConfig({
  githubUser: string;      // GitHub 用户名
  githubRepo: string;      // GitHub 仓库名
  githubRef: string;       // 分支名或 commit hash
  cdnNodes?: CDNNode[];    // 可选, 自定义 CDN 节点列表
  defaultNodeId?: string;  // 可选, 默认节点 ID
});
```

#### `createCloudflareCDNConfig(options)`

创建 Cloudflare Worker CDN 配置。

```typescript
const config = createCloudflareCDNConfig({
  workerDomain: string;    // Worker 域名, 例如: 'your-worker.workers.dev'
  githubUser?: string;     // 可选, GitHub 用户名
  githubRepo?: string;     // 可选, GitHub 仓库名
  githubRef?: string;      // 可选, 分支名或 commit hash
  additionalNodes?: CDNNode[]; // 可选, 额外的节点
});
```

#### `createNPMCDNConfig(options)`

创建 NPM CDN 配置。

```typescript
const config = createNPMCDNConfig({
  npmPackage: string;      // NPM 包名
  npmVersion?: string;     // 可选, 版本号, 默认 latest
  cdnNodes?: CDNNode[];    // 可选, 自定义 CDN 节点列表
});
```

#### `createMixedCDNConfig(options)`

创建混合 CDN 配置。

```typescript
const config = createMixedCDNConfig({
  nodes: CDNNode[];        // CDN 节点列表
  context?: CDNContext;    // 可选, 上下文信息
});
```

### CDN 节点模板

#### `CDN_NODE_TEMPLATES`

预设的 CDN 节点模板。

```typescript
// GitHub CDN 节点
CDN_NODE_TEMPLATES.github.jsdelivr_main
CDN_NODE_TEMPLATES.github.jsdelivr_fastly
CDN_NODE_TEMPLATES.github.jsdelivr_testing
CDN_NODE_TEMPLATES.github.jsd_mirror
CDN_NODE_TEMPLATES.github.zstatic
CDN_NODE_TEMPLATES.github.github_raw

// Cloudflare CDN 节点
CDN_NODE_TEMPLATES.cloudflare.createWorkerNode(domain: string)
CDN_NODE_TEMPLATES.cloudflare.public_proxy

// NPM CDN 节点
CDN_NODE_TEMPLATES.npm.jsdelivr_npm
CDN_NODE_TEMPLATES.npm.unpkg
CDN_NODE_TEMPLATES.npm.esm_sh
```

### React Hooks

#### `useCDNUrl()`

获取 CDN URL 构建函数。

```typescript
const getCdnUrl = useCDNUrl();
const url = getCdnUrl('/path/to/file.png');
```

#### `useCDNStatus()`

获取 CDN 状态和控制函数。

```typescript
const {
  currentNode,      // 当前选中的节点
  nodeLatencies,    // 所有节点的延迟数据
  isTesting,        // 是否正在测速
  testLatencies,    // 手动触发测速函数
  selectNode        // 手动选择节点函数
} = useCDNStatus();
```

#### `useCDNChunkedDownload()`

获取并行分块下载函数。

```typescript
const chunkedDownload = useCDNChunkedDownload();

const result = await chunkedDownload('/large-file.bin', (progress) => {
  console.log(`${progress.percentage}% | ${(progress.speed / 1024 / 1024).toFixed(1)} MB/s | ETA: ${progress.eta.toFixed(1)}s`);
});
// result: { blob, totalSize, totalTime, usedParallelMode, contentType, nodeContributions }
```

### 并行分块加载器

#### `ChunkedLoader`

独立的并行分块下载引擎, 可在 React 和非 React 环境中使用。

```typescript
import { ChunkedLoader, CDN_NODE_LIMITS } from 'hx-cdn-forge';

// 查看各 CDN 节点的已知文件大小限制
console.log(CDN_NODE_LIMITS);
// {
//   'jsdelivr-main': { maxFileSize: 20971520, supportsRange: true },
//   'github-raw':    { maxFileSize: 104857600, supportsRange: true },
//   'gh-proxy-public': { maxFileSize: -1, supportsRange: true },
//   ...
// }

// 创建加载器
const loader = new ChunkedLoader({
  chunkSize: 2 * 1024 * 1024,           // 分块大小 (默认 2MB)
  maxConcurrency: 6,                     // 最大并发连接数 (默认 6)
  chunkTimeout: 30000,                   // 单分块超时 (默认 30s)
  maxRetries: 3,                         // 单分块重试次数 (默认 3)
  enableWorkStealing: true,              // 启用任务窃取 (默认 true)
  singleConnectionThreshold: 1048576,    // 小于此值使用单连接 (默认 1MB)
});

// 探测节点 Range 支持
const probeResult = await loader.probeNode(node, url);
// { supportsRange: true, contentLength: 15728640, contentType: 'application/octet-stream' }

// 并行分块下载
const result = await loader.download(nodes, buildUrlFn, path, context, latencyResults, onProgress);
```

### React Components

#### `<CDNProvider>`

CDN 上下文提供者。

```tsx
<CDNProvider config={config}>
  {children}
</CDNProvider>
```

#### `<CDNNodeSelector>`

CDN 节点选择器 UI 组件。

```tsx
<CDNNodeSelector
  showRefreshButton={true}
  autoTestOnMount={true}
  className="my-selector"
/>
```

---

## 为什么选择 HX-CDN-Forge

### 与现有方案对比

| 特性 | HX-CDN-Forge | 传统降级方案 | Cloudflare Workers |
|------|-------------|------------|------------------|
| 多源支持 | ✅ GitHub/NPM/CF/自定义 | ❌ | ❌ |
| 运行时延迟测速 | ✅ | ❌ | ❌ |
| 前端组件 | ✅ React UI | ❌ | ❌ |
| 自动选择最快节点 | ✅ | ❌ 仅故障转移 | ❌ |
| 用户手动切换 | ✅ | ❌ | ❌ |
| **并行分块下载** | ✅ 多CDN并行+负载均衡 | ❌ | ❌ |
| **任务窃取** | ✅ 自动重分配 | ❌ | ❌ |
| TypeScript 支持 | ✅ | ❌ | 部分 |
| 中国友好 | ✅ 内置国内镜像 | ❌ | ✅ |

---

## 常见问题

### Q: 如何部署 Cloudflare Workers 代理 GitHub?

**A:** 按照以下步骤:

1. 访问 https://workers.cloudflare.com/
2. 创建 Worker
3. 复制 [gh-proxy](https://github.com/hadis898/gh-proxy) 的 `index.js` 代码
4. 粘贴到 Worker 编辑器并部署
5. 获得域名后, 使用 `createCloudflareCDNConfig()` 配置

**优势**: 完全免费(每天 10 万次请求), 在中国访问速度快。

### Q: 如何在中国大陆获得最佳访问速度?

**A:** 推荐方案:

1. **首选**: 部署 Cloudflare Workers 代理(免费、速度快)
2. **备选**: 使用 JSD Mirror 或 Zstatic 镜像
3. **自有资源**: 使用阿里云 OSS 或腾讯云 COS

### Q: 是否支持私有 GitHub 仓库?

**A:** 支持! 通过 Cloudflare Workers 代理时, 可以在 URL 中嵌入 Token:

```bash
git clone https://user:TOKEN@your-worker.workers.dev/https://github.com/user/private-repo
```

---

## 浏览器支持

- Chrome/Edge: 最新 2 个版本
- Firefox: 最新 2 个版本
- Safari: 最新 2 个版本
- Mobile Safari/Chrome: 最新 2 个版本

---

## 开发

```bash
# 克隆仓库
git clone https://github.com/HengXin666/HX-CDN-Forge.git

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

---

## 贡献

欢迎提交 Issue 和 Pull Request!

---

## License

MIT © HX

---

## 致谢

本项目受到以下项目的启发:

- [gh-proxy](https://github.com/hadis898/gh-proxy) - GitHub 文件加速代理
- [jsDelivr](https://www.jsdelivr.com/) - 开源 CDN 服务
- [JSD Mirror](https://cdn.jsdmirror.com/) - jsDelivr 中国镜像
- [Cloudflare Workers](https://workers.cloudflare.com/) - 无服务器平台

---

<div align="center">

**[⬆ 返回顶部](#hx-cdn-forge)**

Made with ❤️ by HX

</div>
