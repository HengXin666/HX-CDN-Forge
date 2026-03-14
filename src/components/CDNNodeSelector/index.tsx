import React, { useState, useCallback, useRef, useEffect } from 'react';
import type {
  CDNNodeWithLatency,
  CDNNodeSelectorProps,
} from '../../types/cdn';
import { useCDN } from '../../contexts/CDNContext';
import './styles.css';

// ============================================================
// SVG Icons (内联，零依赖)
// ============================================================

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-10.624-2.85a5.5 5.5 0 0 1 9.201-2.465l.312.31H11.77a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .75-.75V3.536a.75.75 0 0 0-1.5 0v2.033l-.312-.31A7 7 0 0 0 2.63 8.384a.75.75 0 0 0 1.449.39l.609.8Z" clipRule="evenodd" />
  </svg>
);

// ============================================================
// Helpers
// ============================================================

const REGION_LABELS: Record<string, string> = {
  china: '中国大陆',
  asia: '亚太',
  global: '全球',
};

function getLatencyText(node: CDNNodeWithLatency): string {
  if (node.latencyStatus === 'testing') return '测速中';
  if (node.latencyStatus === 'failed' || (node.latency !== undefined && node.latency < 0)) return '失败';
  if (node.latencyStatus === 'idle' || node.latency === undefined) return '--';
  return `${Math.round(node.latency)}ms`;
}

function getLatencyClassName(node: CDNNodeWithLatency): string {
  if (node.latencyStatus === 'testing') return 'latency-testing';
  if (node.latencyStatus === 'failed' || (node.latency !== undefined && node.latency < 0)) return 'latency-failed';
  if (node.latencyStatus === 'idle' || node.latency === undefined) return 'latency-idle';
  if (node.latency < 100) return 'latency-excellent';
  if (node.latency < 200) return 'latency-good';
  if (node.latency < 500) return 'latency-normal';
  return 'latency-slow';
}

// ============================================================
// Component
// ============================================================

/**
 * CDN 节点选择器组件
 *
 * 功能：延迟测速 / 节点列表 / 智能排序 / 暗色模式 / 完全可自定义
 *
 * @example
 * ```tsx
 * // 基本用法
 * <CDNNodeSelector />
 *
 * // 自定义节点渲染
 * <CDNNodeSelector
 *   renderNode={({ node, isSelected, latencyText, onSelect }) => (
 *     <div onClick={onSelect} style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
 *       {node.name} - {latencyText}
 *     </div>
 *   )}
 * />
 * ```
 */
export function CDNNodeSelector({
  className = '',
  style,
  showLatency = true,
  showRegion = true,
  title,
  showRefreshButton = true,
  disabled = false,
  compact = false,
  onChange,
  onTestComplete,
  renderTrigger,
  renderNode,
  renderEmpty,
  renderLoading,
}: CDNNodeSelectorProps): React.ReactElement {
  const {
    currentNode,
    nodes,
    isTesting,
    selectNode,
    testAllNodes,
  } = useCDN();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 键盘关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      if (disabled) return;
      selectNode(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        onChange?.(node);
      }
      setIsOpen(false);
    },
    [disabled, selectNode, nodes, onChange],
  );

  const handleRefresh = useCallback(async () => {
    if (disabled || isTesting) return;
    const results = await testAllNodes();
    onTestComplete?.(results);
  }, [disabled, isTesting, testAllNodes, onTestComplete]);

  const toggleOpen = useCallback(() => {
    if (!disabled) setIsOpen((prev) => !prev);
  }, [disabled]);

  // 当前节点的延迟信息
  const currentNodeWithLatency = currentNode
    ? nodes.find((n) => n.id === currentNode.id) || { ...currentNode, latencyStatus: 'idle' as const }
    : null;

  const rootClassName = [
    'cdn-node-selector',
    compact ? 'cdn-compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} style={style} ref={containerRef}>
      {title && <div className="cdn-selector-title">{title}</div>}

      <div className="cdn-selector-container">
        {/* ---- Trigger ---- */}
        {renderTrigger ? (
          <div onClick={toggleOpen} style={{ flex: 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {renderTrigger({ currentNode, isOpen, isTesting })}
          </div>
        ) : (
          <button
            className="cdn-current-node"
            onClick={toggleOpen}
            disabled={disabled}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <div className="cdn-node-info">
              <span className="cdn-node-name">
                {currentNode?.name || '未选择节点'}
              </span>
              {showRegion && currentNode?.region && (
                <span className="cdn-node-region">
                  {REGION_LABELS[currentNode.region] || currentNode.region}
                </span>
              )}
            </div>
            {showLatency && currentNodeWithLatency && (
              <span className={`cdn-latency ${getLatencyClassName(currentNodeWithLatency as CDNNodeWithLatency)}`}>
                {getLatencyText(currentNodeWithLatency as CDNNodeWithLatency)}
              </span>
            )}
            <span className={`cdn-selector-arrow ${isOpen ? 'cdn-arrow-open' : ''}`}>
              <ChevronDownIcon />
            </span>
          </button>
        )}

        {/* ---- Refresh ---- */}
        {showRefreshButton && (
          <button
            className={`cdn-refresh-button ${isTesting ? 'cdn-refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={disabled || isTesting}
            type="button"
            title="刷新测速"
            aria-label="刷新测速"
          >
            <RefreshIcon />
          </button>
        )}

        {/* ---- Dropdown ---- */}
        {isOpen && (
          <div className="cdn-node-list" role="listbox">
            {nodes.length === 0 ? (
              renderEmpty ? renderEmpty() : (
                <div className="cdn-no-nodes">暂无可用节点</div>
              )
            ) : isTesting && renderLoading ? (
              renderLoading()
            ) : (
              nodes.map((node) => {
                const isSelected = currentNode?.id === node.id;
                const isDisabled = disabled || node.enabled === false;
                const latencyText = getLatencyText(node);
                const latencyClass = getLatencyClassName(node);

                if (renderNode) {
                  return (
                    <div key={node.id} role="option" aria-selected={isSelected}>
                      {renderNode({
                        node,
                        isSelected,
                        isDisabled,
                        latencyText,
                        latencyClassName: latencyClass,
                        onSelect: () => handleSelect(node.id),
                      })}
                    </div>
                  );
                }

                return (
                  <button
                    key={node.id}
                    className={`cdn-node-option ${isSelected ? 'cdn-node-selected' : ''} cdn-region-${node.region}`}
                    onClick={() => handleSelect(node.id)}
                    disabled={isDisabled}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="cdn-node-info">
                      <span className="cdn-node-name">{node.name}</span>
                      {showRegion && node.region && (
                        <span className="cdn-node-region">
                          {REGION_LABELS[node.region] || node.region}
                        </span>
                      )}
                      {node.description && (
                        <span className="cdn-node-desc">{node.description}</span>
                      )}
                    </div>
                    {showLatency && (
                      <span className={`cdn-latency ${latencyClass}`}>
                        {latencyText}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CDNNodeSelector;

// ============================================================
// 导出 Helper 函数供自定义渲染使用
// ============================================================

export { getLatencyText, getLatencyClassName, REGION_LABELS };
