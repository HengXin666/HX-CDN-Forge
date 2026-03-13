/**
 * HX-CDN-Forge 使用示例
 * 展示如何使用不同的 CDN 配置
 */

import React from 'react';
import {
  CDNProvider,
  CDNNodeSelector,
  useCDNUrl,
  createGitHubCDNConfig,
  createCloudflareCDNConfig,
  createNPMCDNConfig,
  createMixedCDNConfig,
  CDN_NODE_TEMPLATES,
} from '../src';

/**
 * 示例 1: GitHub 资源加速
 */
export function GitHubExample() {
  const config = createGitHubCDNConfig({
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>GitHub CDN 示例</h2>
        <CDNNodeSelector />
        <GitHubContent />
      </div>
    </CDNProvider>
  );
}

function GitHubContent() {
  const getCdnUrl = useCDNUrl();

  return (
    <div>
      <h3>资源示例</h3>
      <img
        src={getCdnUrl('/screenshots/initial-load.png')}
        alt="初始加载截图"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <p>图片 URL: {getCdnUrl('/screenshots/initial-load.png')}</p>
    </div>
  );
}

/**
 * 示例 2: Cloudflare Workers 代理 GitHub
 * 
 * 前置条件：
 * 1. 部署 gh-proxy 到 Cloudflare Workers
 *    - 访问 https://workers.cloudflare.com/
 *    - 创建 Worker
 *    - 复制 https://github.com/hadis898/gh-proxy 的代码
 *    - 部署后获得域名
 * 
 * 2. 将下面的 workerDomain 替换为你的域名
 */
export function CloudflareExample() {
  const config = createCloudflareCDNConfig({
    // ⚠️ 替换为你自己的 Worker 域名
    workerDomain: 'your-worker.workers.dev',
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main',
    // 可选：添加其他 CDN 节点作为备份
    additionalNodes: [
      CDN_NODE_TEMPLATES.github.jsd_mirror,
      CDN_NODE_TEMPLATES.github.zstatic,
    ],
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Cloudflare Workers CDN 示例</h2>
        <p>
          <strong>优势：</strong>完全免费（每天 10 万次请求），在中国大陆访问速度快
        </p>
        <CDNNodeSelector />
        <CloudflareContent />
      </div>
    </CDNProvider>
  );
}

function CloudflareContent() {
  const getCdnUrl = useCDNUrl();

  return (
    <div>
      <h3>通过 Cloudflare Worker 代理的资源</h3>
      <img
        src={getCdnUrl('/screenshots/initial-load.png')}
        alt="Cloudflare 代理截图"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <p>代理 URL: {getCdnUrl('/screenshots/initial-load.png')}</p>
    </div>
  );
}

/**
 * 示例 3: NPM 包资源加速
 */
export function NPMExample() {
  const config = createNPMCDNConfig({
    npmPackage: 'react',
    npmVersion: '18.2.0',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>NPM CDN 示例</h2>
        <CDNNodeSelector />
        <NPMContent />
      </div>
    </CDNProvider>
  );
}

function NPMContent() {
  const getCdnUrl = useCDNUrl();

  return (
    <div>
      <h3>React UMD 文件</h3>
      <p>
        URL:{' '}
        <code style={{ wordBreak: 'break-all' }}>
          {getCdnUrl('/umd/react.production.min.js')}
        </code>
      </p>
    </div>
  );
}

/**
 * 示例 4: 混合多种 CDN 源
 */
export function MixedExample() {
  // 创建自定义节点列表
  const customNodes = [
    // GitHub CDN 节点
    CDN_NODE_TEMPLATES.github.jsd_mirror,
    CDN_NODE_TEMPLATES.github.zstatic,
    
    // Cloudflare Worker 节点（替换为你的域名）
    CDN_NODE_TEMPLATES.cloudflare.createWorkerNode('your-worker.workers.dev'),
    
    // NPM CDN 节点
    CDN_NODE_TEMPLATES.npm.unpkg,
    
    // 完全自定义节点
    {
      id: 'aliyun-oss',
      name: '阿里云 OSS',
      baseUrl: 'https://your-bucket.oss-cn-beijing.aliyuncs.com',
      region: 'china' as const,
      sourceType: 'custom' as const,
      buildUrl: (baseUrl, resourcePath) => {
        const cleanPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
        return `${baseUrl}${cleanPath}`;
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
      <div>
        <h2>混合 CDN 示例</h2>
        <p>支持 GitHub、Cloudflare、NPM 和自定义 CDN</p>
        <CDNNodeSelector />
        <MixedContent />
      </div>
    </CDNProvider>
  );
}

function MixedContent() {
  const getCdnUrl = useCDNUrl();

  return (
    <div>
      <h3>资源示例</h3>
      <img
        src={getCdnUrl('/screenshots/initial-load.png')}
        alt="混合 CDN 截图"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
}

/**
 * 示例 5: Docusaurus 集成
 * 
 * 在 Docusaurus 项目中使用 HX-CDN-Forge
 */
export function DocusaurusIntegration() {
  // 在 docusaurus.config.js 中配置
  const config = createGitHubCDNConfig({
    githubUser: 'your-username',
    githubRepo: 'your-docs-site',
    githubRef: 'main',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Docusaurus 集成示例</h2>
        <CDNNodeSelector />
        <p>
          在 Docusaurus 的 Layout 组件中包裹 CDNProvider，
          然后在所有页面中使用 useCDNUrl() Hook。
        </p>
      </div>
    </CDNProvider>
  );
}

/**
 * 示例 6: 编程式控制
 */
export function ProgrammaticControl() {
  const config = createGitHubCDNConfig({
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main',
  });

  return (
    <CDNProvider config={config}>
      <CDNController />
    </CDNProvider>
  );
}

function CDNController() {
  const { currentNode, nodeLatencies, testLatencies, selectNode, isTesting } = useCDNStatus();

  const handleRefresh = async () => {
    await testLatencies();
  };

  const handleSelectBest = () => {
    // 找到延迟最低的节点
    const entries = Array.from(nodeLatencies.entries());
    const validEntries = entries.filter(([_, data]) => data.latency !== null);
    
    if (validEntries.length === 0) return;

    const sorted = validEntries.sort((a, b) => a[1].latency! - b[1].latency!);
    const [bestNodeId] = sorted[0];
    selectNode(bestNodeId);
  };

  return (
    <div>
      <h2>编程式控制示例</h2>
      
      <div>
        <p>
          <strong>当前节点：</strong>
          {currentNode ? currentNode.name : '未选择'}
        </p>
        
        <button onClick={handleRefresh} disabled={isTesting}>
          {isTesting ? '测速中...' : '刷新测速'}
        </button>
        
        <button onClick={handleSelectBest} disabled={isTesting}>
          选择最快节点
        </button>
      </div>

      <div>
        <h3>所有节点延迟</h3>
        <ul>
          {Array.from(nodeLatencies.entries()).map(([nodeId, data]) => (
            <li key={nodeId}>
              {nodeId}: {data.latency !== null ? `${data.latency}ms` : '连接失败'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// 导入 useCDNStatus hook
import { useCDNStatus } from '../src';
