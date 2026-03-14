import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type {
  CDNNode,
  CDNLatencyResult,
  CDNNodeWithLatency,
  CDNContextValue,
  CDNProviderProps,
} from '../types/cdn';
import { CDNManager } from '../utils/cdnManager';

const CDNCtx = createContext<CDNContextValue | null>(null);

/**
 * CDN Provider — 为子组件提供 CDN 管理能力
 *
 * @example
 * ```tsx
 * <CDNProvider config={config}>
 *   <App />
 * </CDNProvider>
 * ```
 */
export function CDNProvider({
  config,
  children,
  onInitialized,
  onNodeChange,
}: CDNProviderProps): React.ReactElement {
  const managerRef = useRef<CDNManager | null>(null);

  const [currentNode, setCurrentNode] = useState<CDNNode | null>(null);
  const [nodes, setNodes] = useState<CDNNodeWithLatency[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [latencyResults, setLatencyResults] = useState<Map<string, CDNLatencyResult>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // 确保 manager 只创建一次
  if (!managerRef.current) {
    managerRef.current = new CDNManager(config);
  }

  // 初始化
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    let cancelled = false;

    const init = async () => {
      setIsTesting(true);
      try {
        await manager.initialize();
      } finally {
        if (!cancelled) {
          setCurrentNode(manager.getCurrentNode());
          setNodes(manager.getSortedNodes());
          setLatencyResults(manager.getLatencyResults());
          setIsTesting(false);
          setIsInitialized(true);
          onInitialized?.(manager.getCurrentNode());
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选择节点
  const selectNode = useCallback(
    (nodeId: string) => {
      const manager = managerRef.current;
      if (!manager) return;

      const node = manager.selectNode(nodeId);
      if (node) {
        setCurrentNode(node);
        setNodes(manager.getSortedNodes());
        onNodeChange?.(node);
      }
    },
    [onNodeChange],
  );

  // 测速所有节点（流式：每完成一个就更新 UI）
  const testAllNodes = useCallback(async (): Promise<CDNLatencyResult[]> => {
    const manager = managerRef.current;
    if (!manager) return [];

    setIsTesting(true);
    // 先标记所有节点为 testing 状态
    setNodes((prev) =>
      prev.map((n) => ({ ...n, latencyStatus: 'testing' as const, latency: undefined })),
    );

    try {
      const results = await manager.testAllNodesStreaming((result) => {
        // 每完成一个节点就立即刷新列表
        setLatencyResults(manager.getLatencyResults());
        setNodes(manager.getSortedNodes().map((n) => {
          // 还没测完的保持 testing 状态
          const hasResult = manager.getLatencyResults().has(n.id);
          if (!hasResult) {
            return { ...n, latencyStatus: 'testing' as const, latency: undefined };
          }
          return n;
        }));
      });
      // 全部完成后做最终更新
      setLatencyResults(manager.getLatencyResults());
      setNodes(manager.getSortedNodes());
      return results;
    } finally {
      setIsTesting(false);
    }
  }, []);

  // 构建 URL
  const buildUrl = useCallback((resourcePath: string): string => {
    const manager = managerRef.current;
    if (!manager) return '';
    try {
      return manager.buildUrl(resourcePath);
    } catch {
      return '';
    }
  }, []);

  // 获取排序后的节点
  const getSortedNodes = useCallback((): CDNNodeWithLatency[] => {
    const manager = managerRef.current;
    if (!manager) return [];
    return manager.getSortedNodes();
  }, []);

  const value = useMemo<CDNContextValue>(
    () => ({
      config,
      currentNode,
      nodes,
      isTesting,
      isInitialized,
      latencyResults,
      selectNode,
      testAllNodes,
      buildUrl,
      getSortedNodes,
    }),
    [config, currentNode, nodes, isTesting, isInitialized, latencyResults, selectNode, testAllNodes, buildUrl, getSortedNodes],
  );

  return <CDNCtx.Provider value={value}>{children}</CDNCtx.Provider>;
}

// ============================================================
// Hooks
// ============================================================

/**
 * 获取完整的 CDN Context
 *
 * @example
 * ```tsx
 * const { currentNode, buildUrl, testAllNodes } = useCDN();
 * ```
 */
export function useCDN(): CDNContextValue {
  const ctx = useContext(CDNCtx);
  if (!ctx) {
    throw new Error('useCDN() must be used within a <CDNProvider>');
  }
  return ctx;
}

/**
 * 便捷 Hook：获取 CDN URL 构建函数
 *
 * @example
 * ```tsx
 * const url = useCDNUrl('/path/to/resource.png');
 * // or
 * const { buildUrl } = useCDN();
 * ```
 */
export function useCDNUrl(relativePath: string): string {
  const { buildUrl } = useCDN();
  return buildUrl(relativePath);
}

/**
 * 便捷 Hook：获取当前选中的 CDN 节点
 */
export function useCurrentCDNNode(): CDNNode | null {
  const { currentNode } = useCDN();
  return currentNode;
}

/**
 * 便捷 Hook：获取 CDN 状态（等同于 useCDN，语义化别名）
 */
export function useCDNStatus(): CDNContextValue {
  return useCDN();
}
