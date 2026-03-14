/**
 * CDN Hooks — 便捷再导出
 *
 * 所有 hooks 均已在 contexts/CDNContext.tsx 中定义，
 * 此文件提供备用导入路径以保持向后兼容。
 */

export { useCDN, useCDNUrl, useCurrentCDNNode, useCDNStatus } from '../contexts/CDNContext';
