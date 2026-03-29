import {
  parseInfoYaml,
  serializeInfoYaml,
  parseCacheYaml,
  serializeCacheYaml,
} from '../manifest';
import type { SplitInfo, SplitCache } from '../../types';

describe('parseInfoYaml', () => {
  test('parses complete info.yaml', () => {
    const yaml = `originalName: loli.ass
totalSize: 26214400
mimeType: text/x-ssa
chunkSize: 19922944
createdAt: "2026-03-29T12:00:00Z"
chunks:
  - fileName: 0-loli.ass
    index: 0
    size: 19922944
    sha256: abc123def456
  - fileName: 1-loli.ass
    index: 1
    size: 6291456
    sha256: 789ghi012jkl
`;

    const info = parseInfoYaml(yaml);

    expect(info.originalName).toBe('loli.ass');
    expect(info.totalSize).toBe(26214400);
    expect(info.mimeType).toBe('text/x-ssa');
    expect(info.chunkSize).toBe(19922944);
    expect(info.createdAt).toBe('2026-03-29T12:00:00Z');
    expect(info.chunks).toHaveLength(2);
    expect(info.chunks[0]!.fileName).toBe('0-loli.ass');
    expect(info.chunks[0]!.index).toBe(0);
    expect(info.chunks[0]!.size).toBe(19922944);
    expect(info.chunks[0]!.sha256).toBe('abc123def456');
    expect(info.chunks[1]!.fileName).toBe('1-loli.ass');
    expect(info.chunks[1]!.size).toBe(6291456);
  });

  test('handles single chunk', () => {
    const yaml = `originalName: small.bin
totalSize: 1000
mimeType: application/octet-stream
chunkSize: 1000
createdAt: "2026-01-01T00:00:00Z"
chunks:
  - fileName: 0-small.bin
    index: 0
    size: 1000
    sha256: aaa111
`;
    const info = parseInfoYaml(yaml);
    expect(info.chunks).toHaveLength(1);
    expect(info.chunks[0]!.sha256).toBe('aaa111');
  });
});

describe('serializeInfoYaml', () => {
  test('round-trips correctly', () => {
    const info: SplitInfo = {
      originalName: 'test.bin',
      totalSize: 50000000,
      mimeType: 'application/octet-stream',
      chunkSize: 19922944,
      createdAt: '2026-03-29T12:00:00Z',
      chunks: [
        { fileName: '0-test.bin', index: 0, size: 19922944, sha256: 'hash1' },
        { fileName: '1-test.bin', index: 1, size: 19922944, sha256: 'hash2' },
        { fileName: '2-test.bin', index: 2, size: 10154112, sha256: 'hash3' },
      ],
    };

    const yaml = serializeInfoYaml(info);
    const parsed = parseInfoYaml(yaml);

    expect(parsed.originalName).toBe(info.originalName);
    expect(parsed.totalSize).toBe(info.totalSize);
    expect(parsed.chunks).toHaveLength(3);
    expect(parsed.chunks[2]!.sha256).toBe('hash3');
  });
});

describe('parseCacheYaml', () => {
  test('parses .cache.yaml', () => {
    const yaml = `sourcePath: static/ass/loli.ass
sourceHash: abcdef1234567890
sourceSize: 26214400
generatedAt: "2026-03-29T12:00:00Z"
`;
    const cache = parseCacheYaml(yaml);
    expect(cache.sourcePath).toBe('static/ass/loli.ass');
    expect(cache.sourceHash).toBe('abcdef1234567890');
    expect(cache.sourceSize).toBe(26214400);
    expect(cache.generatedAt).toBe('2026-03-29T12:00:00Z');
  });
});

describe('serializeCacheYaml', () => {
  test('round-trips correctly', () => {
    const cache: SplitCache = {
      sourcePath: 'data/big.bin',
      sourceHash: 'deadbeef',
      sourceSize: 99999999,
      generatedAt: '2026-06-01T00:00:00Z',
    };

    const yaml = serializeCacheYaml(cache);
    const parsed = parseCacheYaml(yaml);

    expect(parsed.sourcePath).toBe(cache.sourcePath);
    expect(parsed.sourceHash).toBe(cache.sourceHash);
    expect(parsed.sourceSize).toBe(cache.sourceSize);
  });
});
