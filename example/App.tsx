import React, { useState } from 'react';
import {
  CDNProvider,
  CDNNodeSelector,
  useCDN,
  useCDNUrl,
  createGitHubCDNConfig,
} from '../src';

/**
 * 示例：CDN 图片组件
 * 自动使用选中的 CDN 节点加载图片
 */
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
          padding: '20px', 
          background: '#f3f4f6', 
          borderRadius: '4px',
          textAlign: 'center' 
        }}>
          加载中...
        </div>
      )}
      {error && (
        <div style={{ 
          padding: '20px', 
          background: '#fee2e2', 
          borderRadius: '4px',
          textAlign: 'center',
          color: '#dc2626'
        }}>
          加载失败
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
          ...props.style 
        }}
      />
      {currentNode && (
        <div style={{
          position: 'absolute',
          bottom: '4px',
          right: '4px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '10px',
        }}>
          {currentNode.name}
        </div>
      )}
    </div>
  );
}

/**
 * 示例：CDN 链接组件
 */
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

/**
 * 示例主应用
 */
function ExampleApp() {
  // 创建 CDN 配置
  const cdnConfig = createGitHubCDNConfig({
    githubUser: 'facebook',
    githubRepo: 'react',
    githubRef: 'main',
    autoSelectBest: true,
  });

  return (
    <CDNProvider 
      config={cdnConfig}
      onInitialized={(manager) => {
        console.log('CDN Manager initialized:', manager.getCurrentNode());
      }}
      onNodeChange={(node) => {
        console.log('CDN node changed:', node);
      }}
    >
      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>CDN 节点选择器示例</h1>
        
        {/* CDN 节点选择器 */}
        <div style={{ marginBottom: '30px' }}>
          <CDNNodeSelector
            showLatency={true}
            showRegion={true}
            showRefreshButton={true}
            onTestComplete={(results) => {
              console.log('Latency test completed:', results);
            }}
          />
        </div>

        {/* 使用示例 */}
        <div style={{ marginBottom: '30px' }}>
          <h2>图片加载示例</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            <CDNImage 
              path="/scripts/rollup/build.js" 
              alt="示例文件"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        </div>

        {/* 文件链接示例 */}
        <div style={{ marginBottom: '30px' }}>
          <h2>文件链接示例</h2>
          <CDNLink 
            path="/README.md"
            target="_blank"
            style={{ color: '#3b82f6', textDecoration: 'underline' }}
          >
            查看 README.md
          </CDNLink>
        </div>

        {/* 实时 URL 显示 */}
        <div style={{ marginBottom: '30px' }}>
          <h2>实时 URL 构建</h2>
          <URLDisplay path="/package.json" />
        </div>
      </div>
    </CDNProvider>
  );
}

/**
 * URL 显示组件
 */
function URLDisplay({ path }: { path: string }) {
  const url = useCDNUrl(path);
  const { currentNode, isInitialized } = useCDN();

  if (!isInitialized) {
    return <div style={{ color: '#6b7280' }}>初始化中...</div>;
  }

  return (
    <div style={{ 
      background: '#f9fafb', 
      padding: '12px', 
      borderRadius: '6px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '8px', color: '#6b7280', fontSize: '12px' }}>
        路径: {path}
      </div>
      <div style={{ 
        fontFamily: 'monospace', 
        fontSize: '13px',
        wordBreak: 'break-all',
        color: '#1f2937'
      }}>
        {url || '未选择节点'}
      </div>
      {currentNode && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#059669' }}>
          当前节点: {currentNode.name} ({currentNode.region})
        </div>
      )}
    </div>
  );
}

export default ExampleApp;
