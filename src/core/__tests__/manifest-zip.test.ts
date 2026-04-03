/**
 * manifest-zip.test.ts — info-zip.yaml 解析/序列化测试
 */

import { parseInfoZipYaml, serializeInfoZipYaml } from '../manifest';
import type { ZipInfo } from '../../types';

describe('parseInfoZipYaml', () => {
  const sampleYaml = `originalName: loli.ass
totalSize: 10610165
mimeType: text/x-ssa
encoding: gzip
compressedFile: loli.ass.gz
compressedSize: 2453142
compressedSha256: abc123def456
ratio: 0.23
createdAt: "2026-04-04T00:00:00Z"
`;

  it('should parse all fields correctly', () => {
    const result = parseInfoZipYaml(sampleYaml);

    expect(result.originalName).toBe('loli.ass');
    expect(result.totalSize).toBe(10610165);
    expect(result.mimeType).toBe('text/x-ssa');
    expect(result.encoding).toBe('gzip');
    expect(result.compressedFile).toBe('loli.ass.gz');
    expect(result.compressedSize).toBe(2453142);
    expect(result.compressedSha256).toBe('abc123def456');
    expect(result.ratio).toBe(0.23);
    expect(result.createdAt).toBe('2026-04-04T00:00:00Z');
  });

  it('should parse brotli encoding', () => {
    const brYaml = sampleYaml.replace('encoding: gzip', 'encoding: br');
    const result = parseInfoZipYaml(brYaml);
    expect(result.encoding).toBe('br');
  });

  it('should default to gzip for unknown encoding', () => {
    const unknownYaml = sampleYaml.replace('encoding: gzip', 'encoding: unknown');
    const result = parseInfoZipYaml(unknownYaml);
    expect(result.encoding).toBe('gzip');
  });

  it('should handle missing fields gracefully', () => {
    const minimalYaml = `originalName: test.json
totalSize: 1000
encoding: gzip
compressedFile: test.json.gz
compressedSize: 200
`;
    const result = parseInfoZipYaml(minimalYaml);
    expect(result.originalName).toBe('test.json');
    expect(result.totalSize).toBe(1000);
    expect(result.mimeType).toBe('application/octet-stream'); // default
    expect(result.compressedFile).toBe('test.json.gz');
    expect(result.compressedSize).toBe(200);
    expect(result.compressedSha256).toBe('');
    expect(result.ratio).toBe(0);
    expect(result.createdAt).toBe('');
  });

  it('should handle extra whitespace and Windows line endings', () => {
    const windowsYaml = `originalName: test.css\r\ntotalSize: 5000\r\nencoding: gzip\r\ncompressedFile: test.css.gz\r\ncompressedSize: 1000\r\n`;
    const result = parseInfoZipYaml(windowsYaml);
    expect(result.originalName).toBe('test.css');
    expect(result.totalSize).toBe(5000);
  });
});

describe('serializeInfoZipYaml', () => {
  it('should serialize and round-trip correctly', () => {
    const info: ZipInfo = {
      originalName: 'loli.ass',
      totalSize: 10610165,
      mimeType: 'text/x-ssa',
      encoding: 'gzip',
      compressedFile: 'loli.ass.gz',
      compressedSize: 2453142,
      compressedSha256: 'abc123def456',
      ratio: 0.23,
      createdAt: '2026-04-04T00:00:00Z',
    };

    const yaml = serializeInfoZipYaml(info);

    // Round-trip test
    const parsed = parseInfoZipYaml(yaml);
    expect(parsed.originalName).toBe(info.originalName);
    expect(parsed.totalSize).toBe(info.totalSize);
    expect(parsed.mimeType).toBe(info.mimeType);
    expect(parsed.encoding).toBe(info.encoding);
    expect(parsed.compressedFile).toBe(info.compressedFile);
    expect(parsed.compressedSize).toBe(info.compressedSize);
    expect(parsed.compressedSha256).toBe(info.compressedSha256);
    expect(parsed.ratio).toBe(info.ratio);
    expect(parsed.createdAt).toBe(info.createdAt);
  });

  it('should serialize brotli encoding', () => {
    const info: ZipInfo = {
      originalName: 'data.json',
      totalSize: 50000,
      mimeType: 'application/json',
      encoding: 'br',
      compressedFile: 'data.json.br',
      compressedSize: 8000,
      compressedSha256: 'sha256hash',
      ratio: 0.16,
      createdAt: '2026-04-04T12:00:00Z',
    };

    const yaml = serializeInfoZipYaml(info);
    expect(yaml).toContain('encoding: br');
    expect(yaml).toContain('compressedFile: data.json.br');

    const parsed = parseInfoZipYaml(yaml);
    expect(parsed.encoding).toBe('br');
  });

  it('should produce valid YAML format', () => {
    const info: ZipInfo = {
      originalName: 'test.xml',
      totalSize: 100000,
      mimeType: 'application/xml',
      encoding: 'gzip',
      compressedFile: 'test.xml.gz',
      compressedSize: 20000,
      compressedSha256: 'deadbeef',
      ratio: 0.2,
      createdAt: '2026-01-01T00:00:00Z',
    };

    const yaml = serializeInfoZipYaml(info);
    const lines = yaml.split('\n').filter((l) => l.trim());

    expect(lines).toContain('originalName: test.xml');
    expect(lines).toContain('totalSize: 100000');
    expect(lines).toContain('mimeType: application/xml');
    expect(lines).toContain('encoding: gzip');
    expect(lines).toContain('compressedFile: test.xml.gz');
    expect(lines).toContain('compressedSize: 20000');
    expect(lines).toContain('compressedSha256: deadbeef');
    expect(lines).toContain('ratio: 0.2');
    expect(lines).toContain('createdAt: "2026-01-01T00:00:00Z"');
  });
});
