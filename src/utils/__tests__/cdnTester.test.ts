import { CDNTester } from '../cdnTester'
import type { CDNLatencyResult } from '../../types/cdn'

describe('CDNTester', () => {
  test('getBestNodeId finds lowest latency', () => {
    const tester = new CDNTester()
    const results: CDNLatencyResult[] = [
      { nodeId: 'slow', latency: 500, timestamp: 1, success: true },
      { nodeId: 'fast', latency: 50, timestamp: 1, success: true },
      { nodeId: 'mid', latency: 200, timestamp: 1, success: true },
      { nodeId: 'fail', latency: -1, timestamp: 1, success: false },
    ]
    expect(tester.getBestNodeId(results)).toBe('fast')
  })

  test('getBestNodeId returns null if all failed', () => {
    const tester = new CDNTester()
    const results: CDNLatencyResult[] = [
      { nodeId: 'a', latency: -1, timestamp: 1, success: false },
      { nodeId: 'b', latency: -1, timestamp: 1, success: false },
    ]
    expect(tester.getBestNodeId(results)).toBeNull()
  })

  test('setTimeout and setRetryCount do not throw', () => {
    const tester = new CDNTester()
    tester.setTimeout(3000)
    tester.setRetryCount(5)
  })
})
