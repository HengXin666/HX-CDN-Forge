# Cloudflare Workers 部署指南

本指南将帮助你部署自己的 GitHub CDN 代理服务，使用 Cloudflare Workers 在中国大陆快速访问 GitHub 资源。

---

## 为什么使用 Cloudflare Workers？

| 特性 | 说明 |
|------|------|
| **完全免费** | 每天 10 万次免费请求，每分钟限制 1000 次 |
| **无需服务器** | 无服务器架构，无需维护服务器 |
| **全球 CDN** | 利用 Cloudflare 全球 330+ 节点加速 |
| **中国友好** | 在中国大陆访问速度快，延迟低 |
| **支持所有资源** | 支持 GitHub releases、archives、raw files |

---

## 快速部署

### 方法一：一键部署（推荐）

使用现成的 gh-proxy 项目快速部署：

1. **访问 Cloudflare Workers**
   - 打开 https://workers.cloudflare.com/
   - 登录或注册 Cloudflare 账号

2. **创建 Worker**
   - 点击 "Create a Worker"
   - 给 Worker 起一个名字，例如：`hx-cdn-proxy`

3. **复制代码**
   - 打开 https://github.com/hadis898/gh-proxy
   - 复制 `index.js` 文件的全部内容
   - 粘贴到 Worker 编辑器中

4. **部署**
   - 点击 "Save and Deploy"
   - 你的代理服务就部署好了！

5. **获取域名**
   - 部署成功后，你会获得一个域名，例如：
   - `hx-cdn-proxy.your-subdomain.workers.dev`

### 方法二：自定义域名（可选）

如果你有自己的域名，可以绑定自定义域名：

1. **添加域名到 Cloudflare**
   - 在 Cloudflare 控制台添加你的域名
   - 修改域名的 DNS 服务器为 Cloudflare 提供的地址

2. **绑定自定义域名**
   - 进入你的 Worker 设置
   - 点击 "Triggers" 标签
   - 点击 "Add Custom Domain"
   - 输入你的域名，例如：`cdn.yourdomain.com`

3. **使用自定义域名**
   ```tsx
   const config = createCloudflareCDNConfig({
     workerDomain: 'cdn.yourdomain.com',
     githubUser: 'your-username',
     githubRepo: 'your-repo',
     githubRef: 'main',
   });
   ```

---

## 使用方法

### 在 HX-CDN-Forge 中使用

部署完成后，在你的项目中使用：

```tsx
import { CDNProvider, CDNNodeSelector, useCDNUrl, createCloudflareCDNConfig } from 'hx-cdn-forge';
import 'hx-cdn-forge/dist/styles.css';

function App() {
  const config = createCloudflareCDNConfig({
    // 替换为你部署的 Worker 域名
    workerDomain: 'hx-cdn-proxy.your-subdomain.workers.dev',
    githubUser: 'HengXin666',
    githubRepo: 'HX-CDN-Forge',
    githubRef: 'main',
  });

  return (
    <CDNProvider config={config}>
      <CDNNodeSelector />
      <img src={useCDNUrl()('/screenshots/initial-load.png')} alt="截图" />
    </CDNProvider>
  );
}
```

### 直接使用代理 URL

你也可以在任何地方直接使用代理 URL：

```bash
# 原始 GitHub URL
https://github.com/user/repo/archive/master.zip

# 代理 URL（在前面加上你的 Worker 域名）
https://hx-cdn-proxy.your-subdomain.workers.dev/https://github.com/user/repo/archive/master.zip
```

---

## 支持的 GitHub 资源类型

| 资源类型 | 示例 URL |
|---------|---------|
| **分支源码** | `https://github.com/user/repo/archive/master.zip` |
| **Release 源码** | `https://github.com/user/repo/archive/v1.0.0.tar.gz` |
| **Release 文件** | `https://github.com/user/repo/releases/download/v1.0.0/file.zip` |
| **分支文件** | `https://github.com/user/repo/blob/master/file.txt` |
| **Commit 文件** | `https://github.com/user/repo/blob/abc123/file.txt` |
| **Gist** | `https://gist.github.com/user/abc123/raw/...` |
| **Raw 文件** | `https://raw.githubusercontent.com/user/repo/main/file.txt` |

---

## 高级配置

### 配置选项

gh-proxy 支持以下环境变量配置：

```javascript
// 在 Worker 编辑器中设置环境变量
const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/'; // 静态资源 URL
const PREFIX = '/'; // 路由前缀
```

### 访问控制

如果你想限制访问，可以在 Worker 代码中添加验证：

```javascript
// 简单的 Token 验证
addEventListener('fetch', event => {
  const token = event.request.headers.get('X-CDN-Token');
  if (token !== 'your-secret-token') {
    return new Response('Unauthorized', { status: 401 });
  }
  event.respondWith(handleRequest(event.request));
});
```

### 文件大小限制

Cloudflare Workers 免费版有以下限制：

- **请求体大小**：最大 100MB
- **响应体大小**：无限制（流式传输）
- **CPU 时间**：每请求最多 10ms（免费）或 50ms（付费）

---

## 成本说明

### 免费额度

Cloudflare Workers 免费计划：

- **请求数**：每天 10 万次
- **速率限制**：每分钟 1000 次
- **CPU 时间**：每请求 10ms

### 付费计划

如果超出免费额度：

- **Workers Paid**：$5/月
  - 每月 1000 万次请求
  - 超出部分 $0.5/百万次
  - 每请求 50ms CPU 时间

---

## 常见问题

### Q: 10 万次请求够用吗？

**A:** 对于个人网站或小型项目，10 万次/天完全足够。例如：
- 如果每个页面加载 10 个资源
- 每天可以支持 1 万次页面访问

### Q: 如何查看使用统计？

**A:** 在 Cloudflare 控制台：
1. 进入你的 Worker
2. 点击 "Analytics" 标签
3. 查看请求数、错误率、延迟等数据

### Q: 速度如何？

**A:** 根据测试：
- 在中国大陆：延迟 50-200ms
- 在海外：延迟 10-50ms
- 比直接访问 GitHub Raw 快 5-10 倍

### Q: 是否安全？

**A:** 是的，gh-proxy 是开源项目：
- 代码完全透明
- 可以自己部署，完全控制
- 不经过第三方服务器

### Q: 支持私有仓库吗？

**A:** 支持！通过在 URL 中嵌入 Token：

```bash
# 使用 Token 访问私有仓库
git clone https://user:TOKEN@hx-cdn-proxy.workers.dev/https://github.com/user/private-repo

# 或者访问私有文件
https://hx-cdn-proxy.workers.dev/https://user:TOKEN@github.com/user/private-repo/raw/main/file.txt
```

⚠️ **注意**：Token 会出现在 URL 中，请妥善保管。

---

## 相关资源

- [gh-proxy 项目](https://github.com/hadis898/gh-proxy)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [HX-CDN-Forge GitHub](https://github.com/HengXin666/HX-CDN-Forge)

---

## 替代方案

如果你不想使用 Cloudflare Workers，还有其他选择：

### 1. Vercel 部署

使用 [vercel-reverse-proxy](https://github.com/gaboolic/vercel-reverse-proxy)

### 2. 公共代理服务

- `https://gh.api.99988866.xyz/` - gh-proxy 公共服务
- `https://gh-proxy.com/` - 另一个公共服务

⚠️ **注意**：公共服务仅限小规模使用，大规模使用请自行部署。

---

## 总结

使用 Cloudflare Workers 部署自己的 GitHub CDN 代理：

✅ 完全免费（每天 10 万次请求）  
✅ 无需服务器维护  
✅ 在中国访问速度快  
✅ 支持所有 GitHub 资源  
✅ 可绑定自定义域名  
✅ 支持私有仓库  

---

<div align="center">

**[⬆ 返回顶部](#cloudflare-workers-部署指南)**

</div>
