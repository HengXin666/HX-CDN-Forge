import React, { useState } from 'react';
import {
  CDNProvider,
  CDNNodeSelector,
  useCDN,
  useCDNUrl,
  useReqByCDN,
  createForgeConfig,
} from '../src';
import type { DownloadProgress } from '../src';

// ============================================================
// 示例：CDN 图片组件
// ============================================================

function CDNImage({
  path,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { path: string }) {
  const url = useCDNUrl(path);
  const { currentNode } = useCDN();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {!loaded && !error && (
        <div style={{
          padding: '32px',
          background: '#f1f5f9',
          borderRadius: '10px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '14px',
        }}>
          loading...
        </div>
      )}
      {error && (
        <div style={{
          padding: '32px',
          background: '#fef2f2',
          borderRadius: '10px',
          textAlign: 'center',
          color: '#dc2626',
          fontSize: '14px',
        }}>
          load fail
        </div>
      )}
      <img
        {...props}
        src={url}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{
          display: loaded && !error ? 'block' : 'none',
          maxWidth: '100%',
          borderRadius: '10px',
          ...props.style,
        }}
      />
      {currentNode && loaded && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          color: 'white',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          via {currentNode.name}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 示例：CDN 链接组件
// ============================================================

function CDNLink({
  path,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { path: string }) {
  const url = useCDNUrl(path);
  return (
    <a {...props} href={url}>
      {children}
    </a>
  );
}

// ============================================================
// URL 显示组件
// ============================================================

function URLDisplay({ path }: { path: string }) {
  const url = useCDNUrl(path);
  const { currentNode, isInitialized } = useCDN();

  if (!isInitialized) {
    return <div style={{ color: '#94a3b8', padding: '12px' }}>initializing...</div>;
  }

  return (
    <div style={{
      background: '#f8fafc',
      padding: '16px',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
    }}>
      <div style={{ marginBottom: '6px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
        PATH: {path}
      </div>
      <div style={{
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        fontSize: '13px',
        wordBreak: 'break-all',
        color: '#1e293b',
        lineHeight: 1.5,
      }}>
        {url || '(no node selected)'}
      </div>
      {currentNode && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#3b82f6', fontWeight: 500 }}>
          Node: {currentNode.name}
        </div>
      )}
    </div>
  );
}

// ============================================================
// reqByCDN 演示组件
// ============================================================

function ReqByCDNDemo() {
  const reqByCDN = useReqByCDN();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const res = await reqByCDN('/README.md', (p) => setProgress(p));
      const text = await res.blob.text();
      setResult(text.slice(0, 500) + (text.length > 500 ? '\n...(truncated)' : ''));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleFetch}
        disabled={loading}
        style={{
          padding: '8px 20px',
          borderRadius: '8px',
          border: '1px solid #3b82f6',
          background: loading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          cursor: loading ? 'wait' : 'pointer',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        {loading ? 'Downloading...' : 'reqByCDN("/README.md")'}
      </button>

      {progress && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: '#f0f9ff',
          borderRadius: '8px',
          fontSize: '13px',
          fontFamily: 'monospace',
        }}>
          {progress.percentage.toFixed(1)}%
          {' | '}
          {(progress.speed / 1024).toFixed(1)} KB/s
          {' | '}
          {progress.loaded}/{progress.total} bytes
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: '#fef2f2',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '13px',
        }}>
          Error: {error}
        </div>
      )}

      {result && (
        <pre style={{
          marginTop: '12px',
          padding: '14px',
          background: '#1e293b',
          color: '#e2e8f0',
          borderRadius: '10px',
          fontSize: '12px',
          lineHeight: 1.5,
          overflow: 'auto',
          maxHeight: '300px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {result}
        </pre>
      )}
    </div>
  );
}

// ============================================================
// 主应用
// ============================================================

function ExampleApp() {
  const cdnConfig = createForgeConfig({
    user: 'facebook',
    repo: 'react',
    ref: 'main',
  });

  return (
    <CDNProvider
      config={cdnConfig}
      onInitialized={(node) => {
        console.log('CDN initialized, current node:', node?.name);
      }}
      onNodeChange={(node) => {
        console.log('CDN node changed to:', node.name);
      }}
    >
      <div style={{
        padding: '32px 24px',
        maxWidth: '720px',
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '8px',
        }}>
          🔥 HX-CDN-Forge v2 Demo
        </h1>
        <p style={{ color: '#64748b', marginBottom: '32px', fontSize: '15px' }}>
          GitHub CDN 代理 — 智能节点选择 + 大文件差分切片 + 多 CDN 并行下载
        </p>

        {/* CDN 节点选择器 */}
        <section style={{ marginBottom: '40px' }}>
          <CDNNodeSelector
            title="CDN Nodes"
            showLatency={true}
            showRegion={true}
            showRefreshButton={true}
            onTestComplete={(results) => {
              console.log('Latency test results:', results);
            }}
          />
        </section>

        {/* 自定义渲染示例 */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Custom Node Render
          </h2>
          <CDNNodeSelector
            showRefreshButton={false}
            renderNode={({ node, isSelected, latencyText, onSelect }) => (
              <div
                onClick={onSelect}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isSelected ? '#eff6ff' : 'transparent',
                  borderRadius: '8px',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? '#2563eb' : '#1e293b' }}>
                  {isSelected ? '> ' : ''}{node.name}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: '#64748b',
                  fontFamily: 'monospace',
                }}>
                  {latencyText}
                </span>
              </div>
            )}
          />
        </section>

        {/* reqByCDN 透明请求演示 */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            reqByCDN — 透明请求
          </h2>
          <ReqByCDNDemo />
        </section>

        {/* 图片加载 */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Image Loading
          </h2>
          <CDNImage
            path="/fixtures/dom/public/react-logo.svg"
            alt="React Logo"
            style={{ width: '200px', height: 'auto' }}
          />
        </section>

        {/* 文件链接 */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            File Links
          </h2>
          <CDNLink
            path="/README.md"
            target="_blank"
            style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500, borderBottom: '1px solid #93c5fd' }}
          >
            View README.md via CDN
          </CDNLink>
        </section>

        {/* 实时 URL */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>
            Resolved URL
          </h2>
          <URLDisplay path="/package.json" />
        </section>
      </div>
    </CDNProvider>
  );
}

export default ExampleApp;
