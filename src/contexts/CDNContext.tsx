import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { CDNConfig, CDNNode, CDNLatencyResult } from '../types/cdn';
import { CDNManager, createCDNManager } from '../utils/cdnManager';

/**
 * CDN Context 类型定义
 */
interface CDNContextValue {
  /** CDN 管理器实例 */
  manager: CDNManager | null;
  /** 当前选中的节点 */
  currentNode: CDNNode | null;
  /** 所有节点（带延迟信息） */
  nodes: Array<CDNNode & { latency?: number; latencyStatus?: 'success' | 'failed' | 'testing' }>;
  /** 是否正在测速 */
  isTesting: boolean;
  /** 测速结果 */
  latencyResults: Map<string, CDNLatencyResult>;
  /** 是否已初始化 */
  isInitialized: boolean;
  /** 选择节点 */
  selectNode: (nodeId: string) => void;
  /** 测试所有节点 */
  testAllNodes: () => Promise<CDNLatencyResult[]>;
  /** 构建 CDN URL */
  buildUrl: (relativePath: string, customRef?: string) => string;
  /** 重新初始化 */
  reinitialize: () => Promise<void>;
}

const CDNContext = createContext<CDNContextValue | null>(null);

/**
 * CDN Provider Props
 */
interface CDNProviderProps {
  /** CDN 配置 */
  config: CDNConfig;
  /** 子组件 */
  children: React.ReactNode;
  /** 初始化完成回调 */
  onInitialized?: (manager: CDNManager) => void;
  /** 节点选择变化回调 */
  onNodeChange?: (node: CDNNode) => void;
}

/**
 * CDN Provider 组件
 */
export function CDNProvider({ 
  config, 
  children, 
  onInitialized, 
  onNodeChange 
}: CDNProviderProps): React.ReactElement {
  const managerRef = useRef<CDNManager | null>(null);
  const [currentNode, setCurrentNode] = useState<CDNNode | null>(null);
  const [nodes, setNodes] = useState<Array<CDNNode & { latency?: number; latencyStatus?: 'success' | 'failed' | 'testing' }>>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [latencyResults, setLatencyResults] = useState<Map<string, CDNLatencyResult>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // 初始化 CDN 管理器
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = createCDNManager(config);
    }

    const manager = managerRef.current;

    const init = async () => {
      await manager.initialize();
      setCurrentNode(manager.getCurrentNode());
      setNodes(manager.getSortedNodes());
      setLatencyResults(manager.getLatencyResults());
      setIsInitialized(true);
      onInitialized?.(manager);
    };

    init();
  }, []); // 只在组件挂载时初始化

  // 选择节点
  const selectNode = useCallback((nodeId: string) => {
    if (!managerRef.current) return;
    
    managerRef.current.selectNode(nodeId);
    const node = managerRef.current.getCurrentNode();
    setCurrentNode(node);
    setNodes(managerRef.current.getSortedNodes());
    
    if (node) {
      onNodeChange?.(node);
    }
  }, [onNodeChange]);

  // 测试所有节点
  const testAllNodes = useCallback(async () => {
    if (!managerRef.current) return [];
    
    setIsTesting(true);
    try {
      const results = await managerRef.current.testAllNodes();
      setLatencyResults(managerRef.current.getLatencyResults());
      setNodes(managerRef.current.getSortedNodes());
      return results;
    } finally {
      setIsTesting(false);
    }
  }, []);

  // 构建 URL
  const buildUrl = useCallback((relativePath: string, customRef?: string) => {
    if (!managerRef.current) return '';
    return managerRef.current.buildUrl(relativePath, customRef);
  }, []);

  // 重新初始化
  const reinitialize = useCallback(async () => {
    if (!managerRef.current) return;
    
    managerRef.current.updateConfig(config);
    await managerRef.current.testAndSelectBest();
    setCurrentNode(managerRef.current.getCurrentNode());
    setNodes(managerRef.current.getSortedNodes());
    setLatencyResults(managerRef.current.getLatencyResults());
  }, [config]);

  const value: CDNContextValue = {
    manager: managerRef.current,
    currentNode,
    nodes,
    isTesting,
    latencyResults,
    isInitialized,
    selectNode,
    testAllNodes,
    buildUrl,
    reinitialize,
  };

  return (
    <CDNContext.Provider value={value}>
      {children}
    </CDNContext.Provider>
  );
}

/**
 * 使用 CDN Context 的 Hook
 */
export function useCDN(): CDNContextValue {
  const context = useContext(CDNContext);
  if (!context) {
    throw new Error('useCDN must be used within a CDNProvider');
  }
  return context;
}

/**
 * 使用 CDN URL 构建的 Hook
 */
export function useCDNUrl(relativePath: string, customRef?: string): string {
  const { buildUrl } = useCDN();
  return buildUrl(relativePath, customRef);
}

/**
 * 使用当前 CDN 节点的 Hook
 */
export function useCurrentCDNNode(): CDNNode | null {
  const { currentNode } = useCDN();
  return currentNode;
}
