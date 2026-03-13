# HX-CDN-Forge

<div align="center">

**一个为 GitHub 资源优化的 React + TypeScript CDN 节点选择器**

[![npm version](https://img.shields.io/npm/v/hx-cdn-forge.svg?style=flat-square)](https://www.npmjs.com/package/hx-cdn-forge)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb?style=flat-square)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[功能特性](#功能特性) • [快速开始](#快速开始) • [API 文档](#api-文档) • [示例](#示例) • [为什么选择 HX-CDN-Forge](#为什么选择-hx-cdn-forge)

</div>

---

## 功能特性

HX-CDN-Forge 是一个专为 GitHub 资源设计的 CDN 智能选择器，解决了 jsDelivr 等国际 CDN 在中国大陆访问不稳定的问题。

### 🚀 核心功能

- **⚡ 实时延迟测速** - 自动测试所有配置的 CDN 节点延迟
- **🎯 智能节点选择** - 首次加载自动选择延迟最低的节点
- **🔄 用户手动切换** - 提供可视化界面，支持用户手动选择节点
- **📊 延迟排序显示** - 节点按延迟时间排序，一目了然
- **💾 持久化存储** - 用户选择自动保存，下次访问自动恢复
- **🛡️ TypeScript 支持** - 完整的类型定义，开发体验友好
- **🌏 中国友好** - 内置多个中国大陆可访问的 CDN 镜像

### 📦 内置 CDN 节点

| CDN 名称 | 节点位置 | 特点 |
|---------|---------|------|
| **jsDelivr (Main)** | 全球 | 官方主节点，最稳定 |
| **jsDelivr (Fastly)** | 全球 | Fastly 节点，备用 |
| **jsDelivr (Testing)** | 全球 | 测试节点 |
| **JSD Mirror** | 中国大陆 | 国内镜像，访问速度快 |
| **Zstatic** | 中国大陆 | 国内镜像，稳定性好 |
| **GitHub Raw** | 全球 | 官方源，速度较慢 |

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

### 基础使用

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createGitHubCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  // 配置 GitHub 仓库信息
  const config = createGitHubCDNConfig({
    githubUser: 'your-username',
    githubRepo: 'your-repo',
    githubRef: 'main', // 或使用 commit hash
  });

  return (
    <CDNProvider config={config}>
      {/* CDN 节点选择器组件 */}
      <CDNNodeSelector />
      
      {/* 使用 CDN URL */}
      <MyContent />
    </CDNProvider>
  );
}

function MyContent() {
  const getCdnUrl = useCDNUrl();
  
  return (
    <div>
      <img src={getCdnUrl('/static/img/logo.png')} alt="Logo" />
      <audio src={getCdnUrl('/music/song.mp3')} controls />
    </div>
  );
}
```

---

## API 文档

### 1. `createGitHubCDNConfig(options)`

创建 GitHub CDN 配置。

```typescript
const config = createGitHubCDNConfig({
  githubUser: string;      // GitHub 用户名
  githubRepo: string;      // GitHub 仓库名
  githubRef: string;       // 分支名或 commit hash
  cdnNodes?: CDNNode[];    // 可选，自定义 CDN 节点列表
});
```

### 2. `<CDNProvider>`

CDN 上下文提供者，必须包裹在组件树顶层。

```tsx
<CDNProvider config={config}>
  {children}
</CDNProvider>
```

### 3. `<CDNNodeSelector>`

CDN 节点选择器 UI 组件。

**Props:**
```typescript
interface CDNNodeSelectorProps {
  showRefreshButton?: boolean;    // 是否显示刷新按钮，默认 true
  autoTestOnMount?: boolean;      // 挂载时自动测速，默认 true
  className?: string;             // 自定义样式类名
}
```

### 4. `useCDNUrl()`

获取 CDN URL 构建函数的 Hook。

```typescript
const getCdnUrl = useCDNUrl();

// 使用
const url = getCdnUrl('/path/to/file.png');
// 返回: https://cdn.jsdelivr.net/gh/user/repo@main/path/to/file.png
```

### 5. `useCDNStatus()`

获取 CDN 状态的 Hook。

```typescript
const { 
  currentNode,      // 当前选中的节点
  nodeLatencies,    // 所有节点的延迟数据
  isTesting,        // 是否正在测速
  testLatencies,    // 手动触发测速函数
  selectNode        // 手动选择节点函数
} = useCDNStatus();
```

---

## 示例

### 示例 1: 基础集成

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createGitHubCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

const config = createGitHubCDNConfig({
  githubUser: 'facebook',
  githubRepo: 'react',
  githubRef: 'main',
});

function App() {
  return (
    <CDNProvider config={config}>
      <header>
        <CDNNodeSelector />
      </header>
      <MainContent />
    </CDNProvider>
  );
}
```

### 示例 2: 自定义 CDN 节点

```tsx
import { CDNProvider, CDNNode } from 'hx-cdn-forge';

const customNodes: CDNNode[] = [
  {
    id: 'my-custom-cdn',
    name: '我的自定义 CDN',
    baseUrl: 'https://my-cdn.example.com',
    region: 'asia',
    buildUrl: (baseUrl, githubPath) => `${baseUrl}${githubPath}`,
  },
];

const config = createGitHubCDNConfig({
  githubUser: 'user',
  githubRepo: 'repo',
  githubRef: 'v1.0.0',
  cdnNodes: customNodes,
});
```

### 示例 3: 编程式控制

```tsx
function CDNController() {
  const { currentNode, nodeLatencies, testLatencies, selectNode } = useCDNStatus();

  const handleRefresh = async () => {
    await testLatencies();
  };

  const handleSelectBest = () => {
    const bestNode = Object.entries(nodeLatencies)
      .filter(([_, latency]) => latency !== null)
      .sort((a, b) => a[1]! - b[1]!)[0];
    
    if (bestNode) {
      selectNode(bestNode[0]);
    }
  };

  return (
    <div>
      <p>当前节点: {currentNode?.name}</p>
      <button onClick={handleRefresh}>刷新测速</button>
      <button onClick={handleSelectBest}>选择最快节点</button>
    </div>
  );
}
```

### 示例 4: 结合 Docusaurus 使用

```tsx
// docusaurus.config.js
import { CDNProvider, createGitHubCDNConfig } from 'hx-cdn-forge';

const config = createGitHubCDNConfig({
  githubUser: 'your-username',
  githubRepo: 'your-docs',
  githubRef: 'main',
});

// 在 swizzle 后的 Layout 组件中
function Layout({ children }) {
  return (
    <CDNProvider config={config}>
      <LayoutComponent>
        {children}
      </LayoutComponent>
    </CDNProvider>
  );
}
```

---

## 为什么选择 HX-CDN-Forge

### 问题背景

在中国大陆访问 GitHub 资源时，经常遇到以下问题：

1. **jsDelivr 不稳定** - 官方 jsDelivr CDN 在国内访问速度波动大，偶尔完全无法访问
2. **缺乏自动切换机制** - 传统方案仅在 CDN 失败时被动降级，无法主动选择最优节点
3. **用户无法感知延迟** - 用户不知道哪个 CDN 更快，只能被动接受
4. **缺乏可视化界面** - 没有友好的 UI 让用户手动选择节点

### HX-CDN-Forge 的解决方案

| 问题 | HX-CDN-Forge 的解决方案 |
|------|----------------------|
| jsDelivr 不稳定 | 内置多个国内镜像（JSD Mirror、Zstatic），自动测速选择 |
| 缺乏自动切换 | 首次加载自动测速，选择延迟最低的节点 |
| 用户无法感知延迟 | 可视化界面显示每个节点的延迟时间 |
| 缺乏可视化界面 | 提供 React 组件，用户可手动选择和切换节点 |

### 与现有方案对比

| 特性 | HX-CDN-Forge | 传统降级方案 | 服务端负载均衡 |
|------|-------------|------------|--------------|
| 运行时延迟测速 | ✅ | ❌ | ✅ |
| 前端组件 | ✅ React UI | ❌ | ❌ |
| 自动选择最快节点 | ✅ | ❌ 仅故障转移 | ✅ |
| 用户手动切换 | ✅ | ❌ | ❌ |
| TypeScript 支持 | ✅ | ❌ | 部分 |
| GitHub 资源专注 | ✅ | ❌ | ❌ |
| 中国友好 | ✅ 内置国内镜像 | ❌ | ❌ |

---

## 技术架构

```
HX-CDN-Forge
├── types/cdn.ts              # TypeScript 类型定义
├── utils/
│   ├── cdnTester.ts          # CDN 延迟测试工具
│   └── cdnManager.ts         # CDN 管理器（节点选择、存储）
├── contexts/CDNContext.tsx   # React Context
├── components/
│   └── CDNNodeSelector/      # UI 组件
│       ├── index.tsx
│       └── styles.css
├── hooks/useCDNConfig.ts     # 配置助手 Hook
└── index.ts                  # 导出文件
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
git clone https://github.com/HX-UserName/hx-cdn-forge.git

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build

# 类型检查
npm run type-check
```

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## License

MIT © HX

---

## 致谢

本项目受到以下 CDN 服务的启发和支持：

- [jsDelivr](https://www.jsdelivr.com/) - 开源 CDN 服务
- [JSD Mirror](https://cdn.jsdmirror.com/) - jsDelivr 中国镜像
- [Zstatic](https://zstatic.net/) - 静态资源 CDN

---

<div align="center">

**[⬆ 返回顶部](#hx-cdn-forge)**

Made with ❤️ by HX

</div>
