import React, { useState, useMemo } from 'react';
import type { CDNNode } from '../../types/cdn';
import { useCDN } from '../../contexts/CDNContext';
import './styles.css';

/**
 * CDN 节点选择器 Props
 */
export interface CDNNodeSelectorProps {
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 是否显示延迟信息 */
  showLatency?: boolean;
  /** 是否显示区域信息 */
  showRegion?: boolean;
  /** 是否自动测试延迟 */
  autoTestLatency?: boolean;
  /** 标题 */
  title?: string;
  /** 是否显示刷新按钮 */
  showRefreshButton?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 选择变化回调 */
  onChange?: (node: CDNNode) => void;
  /** 测速完成回调 */
  onTestComplete?: (results: Array<{ nodeId: string; latency: number }>) => void;
}

/**
 * CDN 节点选择器组件
 * 支持延迟测试、按延迟排序、节点选择等功能
 */
export function CDNNodeSelector({
  className = '',
  style,
  showLatency = true,
  showRegion = true,
  autoTestLatency = true,
  title = 'CDN 节点选择',
  showRefreshButton = true,
  disabled = false,
  onChange,
  onTestComplete,
}: CDNNodeSelectorProps): React.ReactElement {
  const {
    currentNode,
    nodes,
    isTesting,
    selectNode,
    testAllNodes,
  } = useCDN();

  const [isOpen, setIsOpen] = useState(false);

  // 处理节点选择
  const handleSelectNode = (nodeId: string) => {
    if (disabled) return;
    
    selectNode(nodeId);
    const selectedNode = nodes.find(n => n.id === nodeId);
    if (selectedNode) {
      onChange?.(selectedNode);
    }
    setIsOpen(false);
  };

  // 处理刷新测速
  const handleRefresh = async () => {
    if (disabled || isTesting) return;
    
    const results = await testAllNodes();
    onTestComplete?.(
      results
        .filter(r => r.success)
        .map(r => ({ nodeId: r.nodeId, latency: r.latency }))
    );
  };

  // 获取延迟显示文本
  const getLatencyText = (latency?: number, status?: 'success' | 'failed' | 'testing') => {
    if (status === 'testing') return '测试中...';
    if (status === 'failed' || latency === undefined || latency < 0) return '连接失败';
    return `${latency.toFixed(0)}ms`;
  };

  // 获取延迟样式类
  const getLatencyClassName = (latency?: number, status?: 'success' | 'failed' | 'testing') => {
    if (status === 'testing') return 'latency-testing';
    if (status === 'failed' || latency === undefined || latency < 0) return 'latency-failed';
    if (latency < 100) return 'latency-excellent';
    if (latency < 200) return 'latency-good';
    if (latency < 500) return 'latency-normal';
    return 'latency-slow';
  };

  // 渲染延迟指示器
  const renderLatencyIndicator = (latency?: number, status?: 'success' | 'failed' | 'testing') => {
    if (!showLatency) return null;
    
    return (
      <span className={`cdn-latency ${getLatencyClassName(latency, status)}`}>
        {getLatencyText(latency, status)}
      </span>
    );
  };

  return (
    <div className={`cdn-node-selector ${className}`} style={style}>
      {title && <div className="cdn-selector-title">{title}</div>}
      
      <div className="cdn-selector-container">
        {/* 当前节点显示 */}
        <button
          className="cdn-current-node"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          type="button"
        >
          <div className="cdn-node-info">
            <span className="cdn-node-name">
              {currentNode?.name || '未选择节点'}
            </span>
            {showRegion && currentNode?.region && (
              <span className="cdn-node-region">{currentNode.region}</span>
            )}
          </div>
          {currentNode && renderLatencyIndicator(
            nodes.find(n => n.id === currentNode.id)?.latency,
            nodes.find(n => n.id === currentNode.id)?.latencyStatus
          )}
          <span className="cdn-selector-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>

        {/* 刷新按钮 */}
        {showRefreshButton && (
          <button
            className="cdn-refresh-button"
            onClick={handleRefresh}
            disabled={disabled || isTesting}
            type="button"
            title="重新测速"
          >
            {isTesting ? '⏳' : '🔄'}
          </button>
        )}

        {/* 节点列表 */}
        {isOpen && (
          <div className="cdn-node-list">
            {nodes.length === 0 ? (
              <div className="cdn-no-nodes">暂无可用节点</div>
            ) : (
              nodes.map((node) => (
                <button
                  key={node.id}
                  className={`cdn-node-option ${
                    currentNode?.id === node.id ? 'selected' : ''
                  }`}
                  onClick={() => handleSelectNode(node.id)}
                  disabled={disabled || node.enabled === false}
                  type="button"
                >
                  <div className="cdn-node-info">
                    <span className="cdn-node-name">{node.name}</span>
                    {showRegion && node.region && (
                      <span className="cdn-node-region">{node.region}</span>
                    )}
                  </div>
                  {renderLatencyIndicator(node.latency, node.latencyStatus)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CDNNodeSelector;
