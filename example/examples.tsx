/**
 * HX-CDN-Forge v2 使用示例
 * 展示不同配置场景
 */

import React from 'react';
import {
  CDNProvider,
  CDNNodeSelector,
  useCDN,
  useCDNUrl,
  useCDNStatus,
  useReqByCDN,
  createForgeConfig,
  createWorkerNode,
} from '../src';

// ============================================================
// 示例 1: GitHub 资源加速 (基础)
// ============================================================

export function GitHubBasicExample() {
  const config = createForgeConfig({
    user: 'HengXin666',
    repo: 'HX-CDN-Forge',
    ref: 'main',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>GitHub CDN — Basic</h2>
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
      <p>URL: {buildUrl('/README.md')}</p>
    </div>
  );
}

// ============================================================
// 示例 2: 带 Tag 版本管理 (推荐)
// ============================================================

export function TagVersionExample() {
  // 推荐使用 bot-{commitId}-{timestamp} tag 避免 jsDelivr 缓存问题
  const config = createForgeConfig({
    user: 'HengXin666',
    repo: 'HX-CDN-Forge',
    ref: 'bot-a1b2c3-20260329',
  });

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Tag Version (Recommended)</h2>
        <p>Using bot-tag to avoid jsDelivr cache staleness.</p>
        <CDNNodeSelector />
      </div>
    </CDNProvider>
  );
}

// ============================================================
// 示例 3: 大文件差分切片
// ============================================================

export function SplitFileExample() {
  const config = createForgeConfig(
    {
      user: 'HengXin666',
      repo: 'my-assets',
      ref: 'bot-a1b2c3-20260329',
    },
    {
      splitStoragePath: 'static/cdn-black',
      mappingPrefix: 'static',
      splitThreshold: 20 * 1024 * 1024, // 20MB
    },
  );

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Split File (Large File Support)</h2>
        <p>Transparent large file download via reqByCDN()</p>
        <CDNNodeSelector />
        <SplitFileContent />
      </div>
    </CDNProvider>
  );
}

function SplitFileContent() {
  const reqByCDN = useReqByCDN();
  const [status, setStatus] = React.useState('idle');

  const handleDownload = async () => {
    setStatus('downloading...');
    try {
      const result = await reqByCDN('static/ass/loli.ass', (p) => {
        setStatus(`${p.percentage.toFixed(1)}% | ${(p.speed / 1024 / 1024).toFixed(1)} MB/s`);
      });
      setStatus(
        `Done! ${(result.totalSize / 1024 / 1024).toFixed(1)} MB in ${(result.totalTime / 1000).toFixed(1)}s` +
        ` | Split: ${result.usedSplitMode} | Parallel: ${result.usedParallelMode}`
      );
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <button onClick={handleDownload}>Download Large File</button>
      <p style={{ marginTop: '8px', fontFamily: 'monospace', fontSize: '13px' }}>{status}</p>
    </div>
  );
}

// ============================================================
// 示例 4: 极速模式 (Turbo)
// ============================================================

export function TurboModeExample() {
  const config = createForgeConfig(
    {
      user: 'HengXin666',
      repo: 'my-assets',
      ref: 'bot-a1b2c3-20260329',
    },
    {
      splitStoragePath: 'static/cdn-black',
      mappingPrefix: 'static',
      turboMode: true,          // 启用极速模式
      turboConcurrentCDNs: 3,   // 同一分片同时从 3 个 CDN 请求
    },
  );

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Turbo Mode 🚀</h2>
        <p>Same chunk races across multiple CDNs simultaneously.</p>
        <CDNNodeSelector />
      </div>
    </CDNProvider>
  );
}

// ============================================================
// 示例 5: Cloudflare Worker 代理节点
// ============================================================

export function WorkerProxyExample() {
  const workerNode = createWorkerNode('your-worker.workers.dev');

  const config = createForgeConfig(
    {
      user: 'HengXin666',
      repo: 'HX-CDN-Forge',
      ref: 'main',
    },
    {
      nodes: [workerNode], // 仅使用自定义 Worker 节点，也可与默认节点混合
    },
  );

  return (
    <CDNProvider config={config}>
      <div>
        <h2>Cloudflare Worker Proxy</h2>
        <p>Use your own CF Worker as CDN proxy node.</p>
        <CDNNodeSelector />
      </div>
    </CDNProvider>
  );
}

// ============================================================
// 示例 6: 编程式控制
// ============================================================

export function ProgrammaticControl() {
  const config = createForgeConfig({
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
// 示例 7: 自定义渲染 (Render Props)
// ============================================================

export function CustomRenderExample() {
  const config = createForgeConfig({
    user: 'facebook',
    repo: 'react',
    ref: 'main',
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

// ============================================================
// 示例 8: useCDNUrl 直接构建 URL
// ============================================================

export function DirectUrlExample() {
  const config = createForgeConfig({
    user: 'facebook',
    repo: 'react',
    ref: 'main',
  });

  return (
    <CDNProvider config={config}>
      <DirectUrlContent />
    </CDNProvider>
  );
}

function DirectUrlContent() {
  const readmeUrl = useCDNUrl('/README.md');
  const packageUrl = useCDNUrl('/package.json');

  return (
    <div>
      <h2>Direct URL Building</h2>
      <ul style={{ listStyle: 'none', padding: 0, fontFamily: 'monospace', fontSize: '13px' }}>
        <li style={{ padding: '6px 0', wordBreak: 'break-all' }}>
          <strong>README.md:</strong> {readmeUrl || '(initializing...)'}
        </li>
        <li style={{ padding: '6px 0', wordBreak: 'break-all' }}>
          <strong>package.json:</strong> {packageUrl || '(initializing...)'}
        </li>
      </ul>
    </div>
  );
}
