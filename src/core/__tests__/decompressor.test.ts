/**
 * decompressor.test.ts — 解压工具测试
 *
 * 注意: DecompressionStream 是浏览器 API，Node.js 环境下不可用
 * 这里只测试工具函数的逻辑判断，实际解压测试需要在浏览器环境中运行
 */

import {
  supportsDecompressionStream,
  supportsEncoding,
} from '../decompressor';

describe('decompressor — environment detection', () => {
  it('should detect DecompressionStream availability', () => {
    // Node.js 环境下 DecompressionStream 不存在
    const result = supportsDecompressionStream();
    // Node 18+ 支持 DecompressionStream，但 jest 可能不暴露
    expect(typeof result).toBe('boolean');
  });

  it('supportsEncoding should return boolean', () => {
    const gzip = supportsEncoding('gzip');
    const br = supportsEncoding('br');

    expect(typeof gzip).toBe('boolean');
    expect(typeof br).toBe('boolean');

    // Brotli 当前总是返回 false (暂不支持客户端解压)
    expect(br).toBe(false);
  });

  it('supportsEncoding for gzip should match DecompressionStream availability', () => {
    // gzip 支持等同于 DecompressionStream 可用性
    const hasDSS = supportsDecompressionStream();
    const gzip = supportsEncoding('gzip');
    expect(gzip).toBe(hasDSS);
  });
});
