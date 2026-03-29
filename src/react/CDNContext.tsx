/**
 * React Context + Provider + Hooks
 * 包装 ForgeEngine 为 React 组件
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import type {
  CDNNode,
  CDNNodeWithLatency,
  CDNContextValue,
  CDNProviderProps,
  LatencyResult,
  DownloadProgress,
  DownloadResult,
} from '../types';
import { ForgeEngine } from '../core/fetcher';

const CDNCtx = createContext<CDNContextValue | null>(null);

/**
 * CDN Provider — 为子组件提供 CDN 管理能力
 *
 * @example
 * ```tsx
 * import { CDNProvider, createForgeConfig } from 'hx-cdn-forge';
 *
 * const config = createForgeConfig({
 *   user: 'HengXin666',
 *   repo: 'my-assets',
 *   ref: 'bot-a1b2c3-20260329',
 * });
 *
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
  const engineRef = useRef<ForgeEngine | null>(null);

  // 单例引擎
  if (!engineRef.current) {
    engineRef.current = new ForgeEngine(config);
  }

  // 初始阶段就设置临时默认节点 — 保证测速期间也能加载数据
  const [currentNode, setCurrentNode] = useState<CDNNode | null>(
    () => engineRef.current?.getCurrentNode() ?? null,
  );
  const [nodes, setNodes] = useState<CDNNodeWithLatency[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [latencyResults, setLatencyResults] = useState<Map<string, LatencyResult>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const isInitializedRef = useRef(false);

  // 同步 ref
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);

  // 初始化 — 先展示节点列表，再流式测速逐个更新延迟
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    let cancelled = false;

    // 立即展示节点列表（还没有延迟数据）
    setNodes(engine.getSortedNodes());
    // 设置临时默认节点，确保测速期间 buildUrl / reqByCDN 可用
    setCurrentNode(engine.getCurrentNode());

    const init = async () => {
      setIsTesting(true);

      // 把所有节点标记为 testing 状态
      setNodes((prev) =>
        prev.map((n) => ({ ...n, latencyStatus: 'testing' as const, latency: undefined })),
      );

      try {
        // 使用流式测速：每完成一个节点就更新 UI
        // onReady: 第一个成功结果到达就立刻标记就绪，不等超时节点
        await engine.initializeStreaming(
          (result) => {
            if (cancelled) return;
            setLatencyResults(engine.getLatencyResults());
            setNodes(engine.getSortedNodes().map((n) => {
              const hasResult = engine.getLatencyResults().has(n.id);
              if (!hasResult) return { ...n, latencyStatus: 'testing' as const, latency: undefined };
              return n;
            }));
            // 流式测速中也实时更新 currentNode — 引擎内部会选出当前最优节点
            if (!cancelled) {
              setCurrentNode(engine.getCurrentNode());
            }
          },
          () => {
            // onReady — 第一个成功结果到达：立刻可用！
            if (cancelled) return;
            setCurrentNode(engine.getCurrentNode());
            setIsInitialized(true);
            onInitialized?.(engine.getCurrentNode());
          },
        );
      } finally {
        if (!cancelled) {
          setCurrentNode(engine.getCurrentNode());
          setNodes(engine.getSortedNodes());
          setLatencyResults(engine.getLatencyResults());
          setIsTesting(false);
          // 保底设置 (全部失败时也标记完成)
          if (!isInitializedRef.current) {
            setIsInitialized(true);
            onInitialized?.(engine.getCurrentNode());
          }
        }
      }
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选择节点
  const selectNode = useCallback(
    (nodeId: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      const node = engine.selectNode(nodeId);
      if (node) {
        setCurrentNode(node);
        setNodes(engine.getSortedNodes());
        onNodeChange?.(node);
      }
    },
    [onNodeChange],
  );

  // 流式测速
  const testAllNodes = useCallback(async (): Promise<LatencyResult[]> => {
    const engine = engineRef.current;
    if (!engine) return [];

    setIsTesting(true);
    setNodes((prev) =>
      prev.map((n) => ({ ...n, latencyStatus: 'testing' as const, latency: undefined })),
    );

    try {
      const results = await engine.testAllNodesStreaming((result) => {
        setLatencyResults(engine.getLatencyResults());
        setNodes(engine.getSortedNodes().map((n) => {
          const hasResult = engine.getLatencyResults().has(n.id);
          if (!hasResult) return { ...n, latencyStatus: 'testing' as const, latency: undefined };
          return n;
        }));
      });
      setLatencyResults(engine.getLatencyResults());
      setNodes(engine.getSortedNodes());
      return results;
    } finally {
      setIsTesting(false);
    }
  }, []);

  // reqByCDN
  const reqByCDN = useCallback(
    async (filePath: string, onProgress?: (p: DownloadProgress) => void): Promise<DownloadResult> => {
      const engine = engineRef.current;
      if (!engine) throw new Error('ForgeEngine not initialized');
      return engine.reqByCDN(filePath, onProgress);
    },
    [],
  );

  // buildUrl
  const buildUrl = useCallback((filePath: string): string => {
    const engine = engineRef.current;
    if (!engine) return '';
    try { return engine.buildUrl(filePath); } catch { return ''; }
  }, []);

  // getSortedNodes
  const getSortedNodes = useCallback((): CDNNodeWithLatency[] => {
    const engine = engineRef.current;
    if (!engine) return [];
    return engine.getSortedNodes();
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
      reqByCDN,
      buildUrl,
      getSortedNodes,
    }),
    [config, currentNode, nodes, isTesting, isInitialized, latencyResults,
     selectNode, testAllNodes, reqByCDN, buildUrl, getSortedNodes],
  );

  return <CDNCtx.Provider value={value}>{children}</CDNCtx.Provider>;
}

// ============================================================
// Hooks
// ============================================================

/** 获取完整 CDN Context */
export function useCDN(): CDNContextValue {
  const ctx = useContext(CDNCtx);
  if (!ctx) throw new Error('useCDN() must be used within a <CDNProvider>');
  return ctx;
}

/** 获取 CDN URL (小文件直接使用) */
export function useCDNUrl(relativePath: string): string {
  const { buildUrl } = useCDN();
  return buildUrl(relativePath);
}

/** 获取当前选中节点 */
export function useCurrentCDNNode(): CDNNode | null {
  const { currentNode } = useCDN();
  return currentNode;
}

/** 获取 CDN 状态 (= useCDN 别名) */
export function useCDNStatus(): CDNContextValue {
  return useCDN();
}

/**
 * 获取 reqByCDN 函数
 *
 * @example
 * ```tsx
 * const reqByCDN = useReqByCDN();
 *
 * const result = await reqByCDN('static/ass/loli.ass', (p) => {
 *   console.log(`${p.percentage}% | ${(p.speed / 1024 / 1024).toFixed(1)} MB/s`);
 * });
 * // result.blob 是完整文件
 * ```
 */
export function useReqByCDN() {
  const { reqByCDN } = useCDN();
  return reqByCDN;
}
