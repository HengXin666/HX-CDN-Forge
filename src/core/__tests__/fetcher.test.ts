/**
 * fetcher.test.ts — ForgeEngine reqByCDNRace 测试
 */

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock performance.now
let perfNowValue = 0;
(global as any).performance = { now: () => perfNowValue };

// Mock localStorage
const storage = new Map<string, string>();
(global as any).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
};

// Mock AbortController
class MockAbortController {
  signal = { aborted: false };
  abort() { this.signal.aborted = true; }
}
(global as any).AbortController = MockAbortController;

import { ForgeEngine } from '../fetcher';
import { createForgeConfig } from '../config';

function makeConfig(opts: any = {}) {
  return createForgeConfig(
    { user: 'test', repo: 'test-repo', ref: 'main' },
    { autoTest: false, ...opts },
  );
}

function makeBlob(size: number, type = 'application/octet-stream') {
  return {
    size,
    type,
    arrayBuffer: async () => new ArrayBuffer(size),
    text: async () => 'test',
    slice: () => ({}),
    stream: () => ({}),
  };
}

function mockFetchSuccess(blob: any, delay = 0, headers: Record<string, string> = {}) {
  return async (_url: string, _opts?: any) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    return {
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => headers[key.toLowerCase()] ?? null,
      },
      blob: async () => blob,
    };
  };
}

function mockFetchFail(status = 500) {
  return async () => ({
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: () => null },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  storage.clear();
  perfNowValue = 0;
});

describe('ForgeEngine.reqByCDNRace', () => {
  it('should return fastest CDN result', async () => {
    const config = makeConfig();
    const engine = new ForgeEngine(config);
    await engine.initialize();

    const blob = makeBlob(1024);

    // 模拟多个 CDN 节点，第一个慢，第二个快
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      callCount++;
      // info.yaml 请求返回 404 (无切片)
      if (url.includes('info.yaml')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      // 模拟不同 CDN 速度
      const delay = url.includes('fastly') ? 10 : 50;
      await new Promise((r) => setTimeout(r, delay));
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => k.toLowerCase() === 'content-type' ? 'font/ttf' : null },
        blob: async () => blob,
      };
    });

    const result = await engine.reqByCDNRace('fonts/test.ttf');
    expect(result).toBeDefined();
    expect(result.blob).toBe(blob);
    expect(result.usedSplitMode).toBe(false);
    expect(result.totalSize).toBe(1024);
  });

  it('should fallback to single CDN when only 1 node', async () => {
    const config = makeConfig({
      nodes: [{
        id: 'single',
        name: 'Single',
        baseUrl: 'https://example.com',
        region: 'global',
        buildUrl: (_ctx: any, path: string) => `https://example.com/${path}`,
        maxFileSize: 20 * 1024 * 1024,
        supportsRange: true,
      }],
    });
    const engine = new ForgeEngine(config);
    await engine.initialize();

    const blob = makeBlob(512);
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('info.yaml')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => blob,
      };
    });

    const result = await engine.reqByCDNRace('small.txt');
    expect(result).toBeDefined();
    expect(result.totalSize).toBe(512);
  });

  it('should succeed if at least one CDN works', async () => {
    const config = makeConfig();
    const engine = new ForgeEngine(config);
    await engine.initialize();

    const blob = makeBlob(2048);
    let failCount = 0;

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('info.yaml')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      // 只有 jsd-mirror 成功, 其他全部失败
      if (url.includes('jsdmirror')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          blob: async () => blob,
        };
      }
      failCount++;
      throw new Error('Network error');
    });

    const result = await engine.reqByCDNRace('data.bin');
    expect(result).toBeDefined();
    expect(result.blob).toBe(blob);
    expect(failCount).toBeGreaterThan(0);
  });

  it('should throw when all CDNs fail', async () => {
    const config = makeConfig();
    const engine = new ForgeEngine(config);
    await engine.initialize();

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('info.yaml')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      throw new Error('Network error');
    });

    await expect(engine.reqByCDNRace('fail.bin')).rejects.toThrow('All');
  });

  it('should use split mode when info.yaml exists', async () => {
    const config = makeConfig({
      splitStoragePath: 'static/cdn',
      mappingPrefix: 'static',
    });
    const engine = new ForgeEngine(config);
    await engine.initialize();

    const chunkBlob = makeBlob(1024);
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('info.yaml')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/yaml' },
          text: async () => [
            'originalName: big.ttf',
            'totalSize: 1024',
            'mimeType: font/ttf',
            'chunkSize: 1024',
            'createdAt: 2026-01-01T00:00:00.000Z',
            'chunks:',
            '  - fileName: 0-big.ttf',
            '    index: 0',
            '    size: 1024',
            '    sha256: abc123',
          ].join('\n'),
        };
      }
      // 切片下载
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'font/ttf' },
        arrayBuffer: async () => new ArrayBuffer(1024),
        blob: async () => chunkBlob,
      };
    });

    const result = await engine.reqByCDNRace('static/fonts/big.ttf');
    expect(result).toBeDefined();
    expect(result.usedSplitMode).toBe(true);
  });
});
