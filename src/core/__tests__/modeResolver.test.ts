/**
 * modeResolver.test.ts — 下载模式自动选择的单元测试
 */

import {
  resolveDownloadMode,
  getExtension,
  isTextFile,
  isBinaryFile,
  getFileTypeLabel,
} from '../modeResolver';

// ============================================================
// getExtension
// ============================================================

describe('getExtension', () => {
  it('should extract extension from simple filename', () => {
    expect(getExtension('loli.ass')).toBe('ass');
  });

  it('should extract extension from full path', () => {
    expect(getExtension('static/music/天使の3P/INNOCENT BLUE.ass')).toBe('ass');
  });

  it('should return lowercase extension', () => {
    expect(getExtension('file.JSON')).toBe('json');
    expect(getExtension('file.WOFF2')).toBe('woff2');
  });

  it('should return empty for no extension', () => {
    expect(getExtension('Makefile')).toBe('');
    expect(getExtension('path/to/Dockerfile')).toBe('');
  });

  it('should handle hidden files (dot-prefixed)', () => {
    expect(getExtension('.gitignore')).toBe('');
  });

  it('should handle multiple dots', () => {
    expect(getExtension('file.test.ts')).toBe('ts');
    expect(getExtension('archive.tar.gz')).toBe('gz');
  });

  it('should handle empty string', () => {
    expect(getExtension('')).toBe('');
  });
});

// ============================================================
// isTextFile / isBinaryFile
// ============================================================

describe('isTextFile', () => {
  it('should recognize subtitle formats', () => {
    expect(isTextFile('ass')).toBe(true);
    expect(isTextFile('srt')).toBe(true);
    expect(isTextFile('vtt')).toBe(true);
    expect(isTextFile('lrc')).toBe(true);
  });

  it('should recognize web formats', () => {
    expect(isTextFile('html')).toBe(true);
    expect(isTextFile('css')).toBe(true);
    expect(isTextFile('js')).toBe(true);
    expect(isTextFile('ts')).toBe(true);
    expect(isTextFile('tsx')).toBe(true);
    expect(isTextFile('json')).toBe(true);
  });

  it('should recognize data formats', () => {
    expect(isTextFile('xml')).toBe(true);
    expect(isTextFile('yaml')).toBe(true);
    expect(isTextFile('csv')).toBe(true);
    expect(isTextFile('svg')).toBe(true);
  });

  it('should not recognize binary formats', () => {
    expect(isTextFile('woff2')).toBe(false);
    expect(isTextFile('png')).toBe(false);
    expect(isTextFile('mp3')).toBe(false);
  });
});

describe('isBinaryFile', () => {
  it('should recognize font formats', () => {
    expect(isBinaryFile('woff2')).toBe(true);
    expect(isBinaryFile('woff')).toBe(true);
    expect(isBinaryFile('ttf')).toBe(true);
  });

  it('should recognize image formats', () => {
    expect(isBinaryFile('png')).toBe(true);
    expect(isBinaryFile('jpg')).toBe(true);
    expect(isBinaryFile('webp')).toBe(true);
  });

  it('should recognize audio/video formats', () => {
    expect(isBinaryFile('mp3')).toBe(true);
    expect(isBinaryFile('mp4')).toBe(true);
    expect(isBinaryFile('wasm')).toBe(true);
  });

  it('should recognize compressed formats', () => {
    expect(isBinaryFile('zip')).toBe(true);
    expect(isBinaryFile('gz')).toBe(true);
    expect(isBinaryFile('7z')).toBe(true);
  });

  it('should not recognize text formats', () => {
    expect(isBinaryFile('ass')).toBe(false);
    expect(isBinaryFile('json')).toBe(false);
    expect(isBinaryFile('css')).toBe(false);
  });
});

// ============================================================
// getFileTypeLabel
// ============================================================

describe('getFileTypeLabel', () => {
  it('should return "text" for text extensions', () => {
    expect(getFileTypeLabel('ass')).toBe('text');
    expect(getFileTypeLabel('json')).toBe('text');
  });

  it('should return "binary" for binary extensions', () => {
    expect(getFileTypeLabel('woff2')).toBe('binary');
    expect(getFileTypeLabel('png')).toBe('binary');
  });

  it('should return "unknown" for unknown extensions', () => {
    expect(getFileTypeLabel('xyz')).toBe('unknown');
    expect(getFileTypeLabel('')).toBe('unknown');
  });
});

// ============================================================
// resolveDownloadMode — 核心逻辑
// ============================================================

describe('resolveDownloadMode', () => {
  // ---- 文本文件 → split ----

  it('should return "split" for .ass subtitle files', () => {
    expect(resolveDownloadMode('static/music/天使の3P/loli.ass')).toBe('split');
  });

  it('should return "split" for .json files', () => {
    expect(resolveDownloadMode('data/config.json')).toBe('split');
  });

  it('should return "split" for .css files', () => {
    expect(resolveDownloadMode('styles/main.css')).toBe('split');
  });

  it('should return "split" for .svg files', () => {
    expect(resolveDownloadMode('icons/logo.svg')).toBe('split');
  });

  it('should return "split" for .xml files', () => {
    expect(resolveDownloadMode('data/feed.xml')).toBe('split');
  });

  // ---- 二进制文件 → range ----

  it('should return "range" for .woff2 font files', () => {
    expect(resolveDownloadMode('fonts/NotoSans.woff2')).toBe('range');
  });

  it('should return "range" for .png image files', () => {
    expect(resolveDownloadMode('images/hero.png')).toBe('range');
  });

  it('should return "range" for .mp3 audio files', () => {
    expect(resolveDownloadMode('audio/bgm.mp3')).toBe('range');
  });

  it('should return "range" for .wasm files', () => {
    expect(resolveDownloadMode('lib/module.wasm')).toBe('range');
  });

  it('should return "range" for .zip archives', () => {
    expect(resolveDownloadMode('downloads/package.zip')).toBe('range');
  });

  // ---- 未知 / 无扩展名 → split (保守) ----

  it('should return "split" for unknown extension', () => {
    expect(resolveDownloadMode('data/file.xyz')).toBe('split');
  });

  it('should return "split" for no extension', () => {
    expect(resolveDownloadMode('path/to/Makefile')).toBe('split');
  });

  // ---- 大小写不敏感 ----

  it('should be case-insensitive', () => {
    expect(resolveDownloadMode('file.ASS')).toBe('split');
    expect(resolveDownloadMode('file.WOFF2')).toBe('range');
    expect(resolveDownloadMode('file.Json')).toBe('split');
    expect(resolveDownloadMode('file.PNG')).toBe('range');
  });

  // ---- 用户自定义覆盖 ----

  it('should use override for known text extension', () => {
    // 用户强制把 .ass 走 range
    const overrides = { ass: 'range' as const };
    expect(resolveDownloadMode('loli.ass', overrides)).toBe('range');
  });

  it('should use override for known binary extension', () => {
    // 用户强制把 .woff2 走 split
    const overrides = { woff2: 'split' as const };
    expect(resolveDownloadMode('font.woff2', overrides)).toBe('split');
  });

  it('should use override for unknown extension', () => {
    const overrides = { fbx: 'range' as const };
    expect(resolveDownloadMode('model.fbx', overrides)).toBe('range');
  });

  it('should fallback to built-in when override does not match', () => {
    const overrides = { fbx: 'range' as const };
    expect(resolveDownloadMode('file.ass', overrides)).toBe('split');
    expect(resolveDownloadMode('file.png', overrides)).toBe('range');
  });

  it('should support "race" and "direct" modes in overrides', () => {
    const overrides = {
      small: 'race' as const,
      raw: 'direct' as const,
    };
    expect(resolveDownloadMode('file.small', overrides)).toBe('race');
    expect(resolveDownloadMode('file.raw', overrides)).toBe('direct');
  });
});
