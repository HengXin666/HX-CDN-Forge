/**
 * HX-CDN-Forge 使用示例
 * 展示不同 CDN 配置场景
 */

import React from 'react';
import {
  CDNProvider,
  CDNNodeSelector,
  useCDN,
  useCDNUrl,
  useCDNStatus,
  createGitHubCDNConfig,
  createCloudflareCDNConfig,
  createNPMCDNConfig,
  createMixedCDNConfig,
  CDN_NODE_TEMPLATES,
} from '../src';

// ============================================================
// 示例 1: GitHub 资源加速
// ============================================================

export function GitHubExample() {
  const config = createGitHubCDNConfig({
    user: 'HengXin666',
    repo: 'HX-CDN-Forge',
    ref: 'main',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>GitHub CDN Example</h2>
        <CDNNodeSelector />
        <GitHubContent />
      </div>
    </CDNProvider>
  );
}

function GitHubContent() {
  const { buildUrl } = useCDN();

  return (
    <div>
      <h3>Resources</h3>
      <img
        src={buildUrl('/screenshots/initial-load.png')}
        alt="Initial load"
        style={{ maxWidth: '100%', height: 'auto', borderRadius: '10px' }}
      />
      <p>URL: {buildUrl('/screenshots/initial-load.png')}</p>
    </div>
  );
}

// ============================================================
// 示例 2: Cloudflare Workers 代理
// ============================================================

export function CloudflareExample() {
  const config = createCloudflareCDNConfig({
    workerDomain: 'your-worker.workers.dev',
    github: {
      user: 'HengXin666',
      repo: 'HX-CDN-Forge',
      ref: 'main',
    },
    extraNodes: [
      CDN_NODE_TEMPLATES.github.jsd_mirror,
      CDN_NODE_TEMPLATES.github.zstatic,
    ],
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Cloudflare Workers CDN</h2>
        <p>Free: 100k requests/day. Great for China mainland access.</p>
        <CDNNodeSelector />
      </div>
    </CDNProvider>
  );
}

// ============================================================
// 示例 3: NPM 包资源加速
// ============================================================

export function NPMExample() {
  const config = createNPMCDNConfig({
    package: 'react',
    version: '18.2.0',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>NPM CDN</h2>
        <CDNNodeSelector />
        <NPMContent />
      </div>
    </CDNProvider>
  );
}

function NPMContent() {
  const { buildUrl } = useCDN();

  return (
    <div>
      <h3>React UMD</h3>
      <code style={{ wordBreak: 'break-all', fontSize: '13px' }}>
        {buildUrl('/umd/react.production.min.js')}
      </code>
    </div>
  );
}

// ============================================================
// 示例 4: 混合多种 CDN 源
// ============================================================

export function MixedExample() {
  const config = createMixedCDNConfig({
    nodes: [
      CDN_NODE_TEMPLATES.github.jsd_mirror,
      CDN_NODE_TEMPLATES.github.zstatic,
      CDN_NODE_TEMPLATES.cloudflare.createWorkerNode('your-worker.workers.dev'),
      CDN_NODE_TEMPLATES.npm.unpkg,
      {
        id: 'aliyun-oss',
        name: 'Aliyun OSS',
        baseUrl: 'https://your-bucket.oss-cn-beijing.aliyuncs.com',
        region: 'china',
        sourceType: 'custom',
        buildUrl: (baseUrl, resourcePath) => {
          const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
          return `${baseUrl}${path}`;
        },
      },
    ],
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
        <h2>Mixed CDN</h2>
        <p>Supports GitHub, Cloudflare, NPM, and custom CDN sources.</p>
        <CDNNodeSelector />
      </div>
    </CDNProvider>
  );
}

// ============================================================
// 示例 5: 编程式控制
// ============================================================

export function ProgrammaticControl() {
  const config = createGitHubCDNConfig({
    user: 'HengXin666',
    repo: 'HX-CDN-Forge',
    ref: 'main',
  });

  return (
    <CDNProvider config={config}>
      <CDNController />
    </CDNProvider>
  );
}

function CDNController() {
  const {
    currentNode,
    nodes,
    isTesting,
    testAllNodes,
    selectNode,
  } = useCDNStatus();

  const handleSelectBest = () => {
    const best = nodes
      .filter((n) => n.latency !== undefined && n.latency >= 0)
      .sort((a, b) => (a.latency ?? Infinity) - (b.latency ?? Infinity))[0];

    if (best) selectNode(best.id);
  };

  return (
    <div>
      <h2>Programmatic Control</h2>
      <p>
        <strong>Current: </strong>
        {currentNode ? currentNode.name : 'none'}
      </p>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button onClick={() => testAllNodes()} disabled={isTesting}>
          {isTesting ? 'Testing...' : 'Run Speed Test'}
        </button>
        <button onClick={handleSelectBest} disabled={isTesting}>
          Select Fastest
        </button>
      </div>
      <div style={{ marginTop: '16px' }}>
        <h3>All Nodes</h3>
        <ul>
          {nodes.map((node) => (
            <li key={node.id} style={{ padding: '4px 0' }}>
              <strong>{node.name}</strong>:{' '}
              {node.latency !== undefined && node.latency >= 0
                ? `${Math.round(node.latency)}ms`
                : node.latencyStatus === 'failed'
                ? 'Failed'
                : '--'}
              {currentNode?.id === node.id && ' (current)'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// 示例 6: 自定义渲染 (Render Props)
// ============================================================

export function CustomRenderExample() {
  const config = createGitHubCDNConfig({
    user: 'facebook',
    repo: 'react',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Custom Render Example</h2>
        <CDNNodeSelector
          renderTrigger={({ currentNode, isOpen }) => (
            <div style={{
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              background: isOpen ? '#f0f9ff' : 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{currentNode?.name ?? 'Pick a CDN node'}</span>
              <span>{isOpen ? '[-]' : '[+]'}</span>
            </div>
          )}
          renderNode={({ node, isSelected, latencyText, onSelect }) => (
            <div
              onClick={onSelect}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                background: isSelected ? '#eff6ff' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: isSelected ? 600 : 400 }}>{node.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {node.description || node.region} &middot; {latencyText}
              </div>
            </div>
          )}
          renderEmpty={() => (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
              No CDN nodes configured.
            </div>
          )}
        />
      </div>
    </CDNProvider>
  );
}
