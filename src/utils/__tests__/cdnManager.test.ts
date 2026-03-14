import {
  CDNManager,
  createCDNManager,
  createGitHubCDNConfig,
  createNPMCDNConfig,
  createCloudflareCDNConfig,
  createMixedCDNConfig,
  CDN_NODE_TEMPLATES,
} from '../cdnManager'
import type { CDNConfig } from '../../types/cdn'

// Mock localStorage
const mockStore: Record<string, string> = {}
const localStorageMock = {
  getItem: jest.fn((key: string) => mockStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { mockStore[key] = value }),
  removeItem: jest.fn((key: string) => { delete mockStore[key] }),
  clear: jest.fn(() => { for (const k of Object.keys(mockStore)) delete mockStore[k] }),
  length: 0,
  key: jest.fn((_: number) => null as string | null),
}

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

beforeEach(() => {
  localStorageMock.clear()
  jest.clearAllMocks()
})

describe('CDN_NODE_TEMPLATES', () => {
  test('GitHub nodes should build correct URLs', () => {
    const ctx = { githubUser: 'owner', githubRepo: 'repo', githubRef: 'v1.0' }
    const node = CDN_NODE_TEMPLATES.github.jsdelivr_main
    const url = node.buildUrl(node.baseUrl, '/docs/readme.md', ctx)
    expect(url).toBe('https://cdn.jsdelivr.net/gh/owner/repo@v1.0/docs/readme.md')
  })

  test('GitHub Raw node format', () => {
    const ctx = { githubUser: 'owner', githubRepo: 'repo', githubRef: 'main' }
    const node = CDN_NODE_TEMPLATES.github.github_raw
    const url = node.buildUrl(node.baseUrl, '/file.txt', ctx)
    expect(url).toBe('https://raw.githubusercontent.com/owner/repo/main/file.txt')
  })

  test('NPM node builds correct URL', () => {
    const ctx = { npmPackage: 'lodash', npmVersion: '4.17.21' }
    const node = CDN_NODE_TEMPLATES.npm.jsdelivr_npm
    const url = node.buildUrl(node.baseUrl, '/lodash.min.js', ctx)
    expect(url).toBe('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js')
  })

  test('throws without context', () => {
    const node = CDN_NODE_TEMPLATES.github.jsdelivr_main
    expect(() => node.buildUrl(node.baseUrl, '/test')).toThrow()
  })

  test('createWorkerNode makes valid node', () => {
    const node = CDN_NODE_TEMPLATES.cloudflare.createWorkerNode('my.workers.dev')
    expect(node.id).toBe('cf-worker-my-workers-dev')
    expect(node.baseUrl).toBe('https://my.workers.dev')
  })
})

describe('Config factories', () => {
  test('createGitHubCDNConfig', () => {
    const c = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    expect(c.nodes.length).toBe(6)
    expect(c.context.githubUser).toBe('u')
    expect(c.context.githubRef).toBe('main')
  })

  test('createGitHubCDNConfig with extraNodes', () => {
    const extra = CDN_NODE_TEMPLATES.cloudflare.createWorkerNode('t.dev')
    const c = createGitHubCDNConfig({ user: 'u', repo: 'r', extraNodes: [extra] })
    expect(c.nodes.length).toBe(7)
  })

  test('createNPMCDNConfig', () => {
    const c = createNPMCDNConfig({ package: 'react', version: '18.2.0' })
    expect(c.context.npmPackage).toBe('react')
    expect(c.nodes.length).toBe(3)
  })

  test('createCloudflareCDNConfig', () => {
    const c = createCloudflareCDNConfig({ workerDomain: 'w.dev', github: { user: 'u', repo: 'r' } })
    expect(c.nodes.length).toBe(1)
    expect(c.context.cfWorkerDomain).toBe('w.dev')
  })

  test('createMixedCDNConfig', () => {
    const c = createMixedCDNConfig({ nodes: [CDN_NODE_TEMPLATES.github.jsd_mirror] })
    expect(c.nodes.length).toBe(1)
  })
})

describe('CDNManager', () => {
  test('creates with initial node', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    const m = new CDNManager(cfg)
    expect(m.getCurrentNode()).not.toBeNull()
  })

  test('selectNode works', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    const m = new CDNManager(cfg)
    const target = m.getAllNodes()[2]!
    expect(m.selectNode(target.id)!.id).toBe(target.id)
  })

  test('selectNode returns null for missing id', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    const m = new CDNManager(cfg)
    expect(m.selectNode('nope')).toBeNull()
  })

  test('buildUrl works', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r', ref: 'v1' })
    const m = new CDNManager(cfg)
    const url = m.buildUrl('/README.md')
    expect(url).toContain('u')
    expect(url).toContain('r')
    expect(url).toContain('v1')
  })

  test('buildUrl throws without node', () => {
    const m = new CDNManager({ context: {}, nodes: [] })
    expect(() => m.buildUrl('/x')).toThrow()
  })

  test('getSortedNodes returns idle nodes before test', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    const m = new CDNManager(cfg)
    const sorted = m.getSortedNodes()
    expect(sorted.length).toBeGreaterThan(0)
    expect(sorted[0]!.latencyStatus).toBe('idle')
  })

  test('createCDNManager factory', () => {
    const cfg = createGitHubCDNConfig({ user: 'u', repo: 'r' })
    expect(createCDNManager(cfg)).toBeInstanceOf(CDNManager)
  })
})
