import {
  CDN_NODE_PRESETS,
  DEFAULT_GITHUB_CDN_NODES,
  createWorkerNode,
  CDNTester,
  getSortedNodesWithLatency,
} from '../cdnNodes';
import { createForgeConfig, normalizeConfig } from '../config';
import type { LatencyResult } from '../../types';

describe('CDN_NODE_PRESETS', () => {
  const ctx = { user: 'owner', repo: 'repo', ref: 'v1.0' };

  test('jsDelivr main builds correct URL', () => {
    const url = CDN_NODE_PRESETS.jsdelivr_main.buildUrl(ctx, '/docs/readme.md');
    expect(url).toBe('https://cdn.jsdelivr.net/gh/owner/repo@v1.0/docs/readme.md');
  });

  test('jsDelivr fastly builds correct URL', () => {
    const url = CDN_NODE_PRESETS.jsdelivr_fastly.buildUrl(ctx, '/file.txt');
    expect(url).toBe('https://fastly.jsdelivr.net/gh/owner/repo@v1.0/file.txt');
  });

  test('GitHub Raw builds correct URL', () => {
    const url = CDN_NODE_PRESETS.github_raw.buildUrl(ctx, '/README.md');
    expect(url).toBe('https://raw.githubusercontent.com/owner/repo/v1.0/README.md');
  });

  test('JSD Mirror builds correct URL', () => {
    const url = CDN_NODE_PRESETS.jsd_mirror.buildUrl(ctx, '/data.json');
    expect(url).toBe('https://cdn.jsdmirror.com/gh/owner/repo@v1.0/data.json');
  });

  test('handles path without leading slash', () => {
    const url = CDN_NODE_PRESETS.jsdelivr_main.buildUrl(ctx, 'no-slash.txt');
    expect(url).toBe('https://cdn.jsdelivr.net/gh/owner/repo@v1.0/no-slash.txt');
  });
});

describe('DEFAULT_GITHUB_CDN_NODES', () => {
  test('has 6 default nodes', () => {
    expect(DEFAULT_GITHUB_CDN_NODES).toHaveLength(6);
  });

  test('all nodes have required fields', () => {
    for (const node of DEFAULT_GITHUB_CDN_NODES) {
      expect(node.id).toBeTruthy();
      expect(node.name).toBeTruthy();
      expect(node.baseUrl).toBeTruthy();
      expect(node.region).toBeTruthy();
      expect(typeof node.buildUrl).toBe('function');
      expect(typeof node.maxFileSize).toBe('number');
      expect(typeof node.supportsRange).toBe('boolean');
    }
  });
});

describe('createWorkerNode', () => {
  test('creates valid node', () => {
    const node = createWorkerNode('my.workers.dev');
    expect(node.id).toBe('cf-worker-my-workers-dev');
    expect(node.name).toContain('my.workers.dev');
    expect(node.baseUrl).toBe('https://my.workers.dev');
    expect(node.maxFileSize).toBe(-1);
    expect(node.supportsRange).toBe(true);
  });

  test('builds correct proxy URL', () => {
    const node = createWorkerNode('proxy.example.com');
    const ctx = { user: 'u', repo: 'r', ref: 'main' };
    const url = node.buildUrl(ctx, '/file.txt');
    expect(url).toBe('https://proxy.example.com/https://raw.githubusercontent.com/u/r/main/file.txt');
  });
});

describe('CDNTester', () => {
  test('getBestNodeId finds lowest latency', () => {
    const tester = new CDNTester();
    const results: LatencyResult[] = [
      { nodeId: 'slow', latency: 500, success: true, timestamp: 1 },
      { nodeId: 'fast', latency: 50, success: true, timestamp: 1 },
      { nodeId: 'mid', latency: 200, success: true, timestamp: 1 },
      { nodeId: 'fail', latency: -1, success: false, timestamp: 1 },
    ];
    expect(tester.getBestNodeId(results)).toBe('fast');
  });

  test('getBestNodeId returns null if all failed', () => {
    const tester = new CDNTester();
    const results: LatencyResult[] = [
      { nodeId: 'a', latency: -1, success: false, timestamp: 1 },
      { nodeId: 'b', latency: -1, success: false, timestamp: 1 },
    ];
    expect(tester.getBestNodeId(results)).toBeNull();
  });
});

describe('getSortedNodesWithLatency', () => {
  test('sorts by latency', () => {
    const nodes = DEFAULT_GITHUB_CDN_NODES.slice(0, 3);
    const results = new Map<string, LatencyResult>([
      [nodes[0]!.id, { nodeId: nodes[0]!.id, latency: 300, success: true, timestamp: 1 }],
      [nodes[1]!.id, { nodeId: nodes[1]!.id, latency: 100, success: true, timestamp: 1 }],
      [nodes[2]!.id, { nodeId: nodes[2]!.id, latency: 200, success: true, timestamp: 1 }],
    ]);

    const sorted = getSortedNodesWithLatency(nodes, results);
    expect(sorted[0]!.latency).toBe(100);
    expect(sorted[1]!.latency).toBe(200);
    expect(sorted[2]!.latency).toBe(300);
  });

  test('failed nodes sort to the end', () => {
    const nodes = DEFAULT_GITHUB_CDN_NODES.slice(0, 2);
    const results = new Map<string, LatencyResult>([
      [nodes[0]!.id, { nodeId: nodes[0]!.id, latency: -1, success: false, timestamp: 1 }],
      [nodes[1]!.id, { nodeId: nodes[1]!.id, latency: 100, success: true, timestamp: 1 }],
    ]);

    const sorted = getSortedNodesWithLatency(nodes, results);
    expect(sorted[0]!.latency).toBe(100);
    expect(sorted[1]!.latency).toBe(-1);
  });
});

describe('createForgeConfig', () => {
  test('creates config with defaults', () => {
    const config = createForgeConfig({ user: 'u', repo: 'r', ref: 'main' });
    expect(config.github.user).toBe('u');
    expect(config.github.repo).toBe('r');
    expect(config.github.ref).toBe('main');
  });

  test('normalizeConfig fills defaults', () => {
    const config = createForgeConfig({ user: 'u', repo: 'r', ref: 'v1' });
    const full = normalizeConfig(config);
    expect(full.splitThreshold).toBe(20 * 1024 * 1024);
    expect(full.maxConcurrency).toBe(6);
    expect(full.turboMode).toBe(false);
    expect(full.nodes).toHaveLength(6);
  });
});
