# Codex Relay PWA 迁移方案

生成时间：2026-07-02 Asia/Shanghai

## 背景

当前 iOS 开发版已经可以通过真机 Debug 包、Metro 和本机 `codex-relay` 跑通，但这个路径不适合作为长期使用方案：

- Personal Team 签名的 iOS 开发包通常只有 7 天有效期。
- Debug 包依赖 Mac 上 Metro 持续运行，且真机需要能访问 Metro 地址。
- VPS 不能绕过 iOS 签名限制，也不能让未签名原生应用长期安装。
- 用户希望长期有效，并尽量不依赖 Mac 做手机安装和调试链路。

新的迁移方向是：把手机端从原生 iOS 开发包迁移为 Web 客户端。当前用户已决定不要域名，先直接使用 VPS IP：`http://43.143.114.214/` 作为 Web 入口，`http://43.143.114.214:8788` 作为 relay API。`codex` 和 `codex-relay` 仍然运行在 Mac 本机，保持当前 local-first 工作方式；VPS 只提供稳定公网入口、静态 Web 托管和到 Mac relay 的转发。

## Superpowers Brainstorming 说明

本次会话没有发现可调用的 `superpowers` 头脑风暴技能或工具，因此按其目标做结构化降级：

1. 先明确目标、非目标和硬约束。
2. 枚举可选架构，并按签名、长期有效性、功能保持度、安全性、运维成本取舍。
3. 为现有移动端功能建立等价迁移矩阵。
4. 把推荐方案拆成阶段、验收门槛和未决问题。

这份文档的结论不是完整实现，而是后续实现 `apps/web` / PWA 客户端时的迁移蓝图。

## 目标

1. 让手机端长期可用，不再依赖 iOS 开发证书、Xcode 安装、Metro 或 7 天重签。
2. 尽量保持现有 Codex Relay 手机体验：聊天、流式输出、线程列表、审批、设置、workspace preview、文件查看/编辑、web preview、terminal 等。
3. 保持当前安全边界：代码、shell、git 状态、Codex CLI、provider key 和 workspace 都留在 Mac 本机。
4. 使用 VPS IP 提供稳定入口，使手机通过公网访问，不再依赖 `169.254.x.x`、同一 Wi-Fi 或临时 Metro 地址。
5. 复用现有 `packages/codex-relay/src/api-schema.ts` 的 API contract，避免为 Web 端另造协议。

## 非目标

1. 不把 Codex CLI、用户代码仓库或 provider key 搬到 VPS。
2. 不继续把原生 iOS release/archive 安装作为主路径。
3. 不尝试绕过 Apple 签名规则。
4. 不在手机客户端保存 OpenAI、ChatGPT 或自定义 provider 密钥。
5. 第一阶段不追求 100% 原生手感，只追求主要工作流可用和可长期维护。

## 功能移植列表

状态定义：

- `done`: Web 入口已经具备等价核心能力。
- `next`: 已有 Relay API，优先移植到 Web。
- `guarded`: 可以迁移，但有安全或副作用风险，需要二次确认、只读优先或独立入口。
- `blocked`: 受 HTTP/IP、浏览器能力、证书或系统权限限制，暂不作为主线。

| 功能 | 原生客户端体验 | Relay/API 支撑 | Web 迁移状态 | 迁移策略 |
| --- | --- | --- | --- | --- |
| 连接探测 | 查看 relay/version/status | `/version`, `/v1/status` | `done` | 保留顶部状态与连接弹框。 |
| 安全配对 | 扫码/粘贴 pairing link，approve 后保存 session | `/v1/pair/*`, secure request payload | `done` | Web 使用 pairing link 粘贴和 relay payload 拉取。 |
| 线程列表 | 浏览历史会话、选择会话 | `/v1/threads` | `done` | 移动端抽屉列表，支持搜索。 |
| 打开线程 | 查看消息、状态、当前工作区 | `/v1/threads/:id` | `done` | 聊天详情页保持独立滚动。 |
| 新建线程 | 创建新任务并发送 prompt | `POST /v1/threads`, stream run | `done` | 输入区支持新会话/继续当前。 |
| 发送消息 | 给当前线程继续输入 | `/v1/threads/:id/runs/stream` | `done` | 使用 SSE 流式输出。 |
| 运行中追加输入 | running 线程 queue/steer | `/v1/threads/:id/input` | `done` | 已支持队列、移除和 steering。 |
| 流式输出 | 实时显示 assistant/tool/status | `/v1/threads/:id/runs/stream` | `done` | 保持 SSE，支持停止接收。 |
| 审批 | approve/approve for session/deny | `/v1/approvals/:id` | `done` | 审批卡片在移动端全宽展示。 |
| 结构化提问 | Codex 主动问用户问题 | pending input request + approvals | `done` | 已显示问题、选项和回答提交。 |
| 输出详情 | 查看 command output / patch | `/v1/threads/:id/messages/:messageId/detail/:field` | `done` | 已支持查看输出和 Patch。 |
| Web preview | 打开 Codex 检测到的 preview port | `/v1/workspace/web-preview/:port` | `done` | 已显示 preview target 卡片。 |
| 用量统计 | rate limit、context window | `/v1/rate-limits`, `/v1/threads/:id/context-window` | `next` | Phase 5A 工具面板优先做只读仪表。 |
| 模型切换 | model/reasoning/service tier/runtime mode | `/v1/models`, `PATCH /v1/preferences` | `next` | 只暴露 runtime preference；provider key 留在 Mac。 |
| 工作区目录 | 选择/查看工作区目录 | `/v1/workspace-directories` | `done` | Web 工具面板已支持目录浏览，并可设为新会话目录覆盖。 |
| 文件查看 | 搜索文件、预览内容 | `/v1/workspace/files`, `/v1/workspace/file` | `next` | Phase 5A 做只读列表和预览。 |
| 文件编辑 | 原生代码编辑器/WebView | `PUT /v1/workspace/file` | `done` | Web 已支持文本文件编辑，保存前必须经过危险操作隔离层确认。 |
| Git 查看 | 分支、status、diff、文件列表 | `/v1/workspace/changes` | `next` | Phase 5A 只读展示 branch/stats/files/patch。 |
| Git checkout | 切分支 | `/v1/workspace/checkout` | `done` | Web 已接入危险操作隔离层，确认目标分支后才执行 checkout/create branch。 |
| Git commit/push | 提交并推送 | `/v1/workspace/commit-push` | `done` | Web 已接入危险操作隔离层，确认文件数、commit message 和短语后才执行 add/commit/push。 |
| SSH/Terminal | 原生嵌入 terminal | `/v1/workspace/terminal/*` | `done` | Web 已接入 Terminal tab；启动、发送命令、关闭 session 均走危险操作隔离层。 |
| Skills | 查看/选择可用 skills | `/v1/skills` | `done` | Web 工具面板已支持选择 skills，并随下一条消息发送。 |
| Goal/预算 | 线程目标、token/time budget | `/v1/threads/:id/goal` | `done` | Web 工具面板已支持查看和保存当前线程 goal。 |
| 图片附件 | 选择/上传图片给 prompt | `/v1/attachments/images` | `done` | Web composer 已支持选择图片上传，并随下一条消息发送。 |
| 自动化 | 查看/触发 automations | `/v1/automations`, `/v1/automations/:id/runs` | `done` | Web 已支持列表和手动运行；运行前必须经过危险操作隔离层确认。 |
| 语音输入 | 原生语音识别/麦克风权限 | 浏览器 Web Speech/MediaDevices 受 secure context 限制 | `blocked` | HTTP/IP 下先依赖 iOS 键盘听写；HTTPS/VPN 后再做 Web Speech。 |
| Push/后台通知 | 原生通知 | 需要 PWA + HTTPS + permission | `blocked` | 等 HTTPS 和 PWA manifest 稳定后再评估。 |
| 离线缓存/PWA 安装 | 原生 App 常驻 | Service Worker 需要 HTTPS | `blocked` | 裸 IP HTTP 阶段不作为验收项。 |

### 当前执行顺序

1. Phase 5A: 工具面板，移植 `用量统计`、`模型切换`、`文件查看`、`Git 查看`。已完成。
2. Phase 5B: 目录、skills、goal、图片附件、文件编辑。已完成，文件保存接入危险操作隔离层。
3. Phase 5C: Terminal/SSH、Git 写操作、automations 触发，全部放入危险操作确认流。危险操作隔离层、Terminal、Git checkout、Git commit/push、文件保存、automation run 已完成。
4. Phase 6: HTTPS/PWA 后再补语音、通知、离线缓存和主屏安装体验。

### 危险操作隔离层

Phase 5C 起，所有会在 Mac 本机产生强副作用的 Web 操作必须经过统一确认层：

- `Terminal`: 启动 shell、发送命令、关闭 session。
- `Git write`: checkout、commit、push。已接入。
- `File write`: 保存文件内容。已接入。
- `Automation run`: 手动触发 automation。已接入。

隔离层要求：

1. 在执行前展示操作标题、影响说明、目标 workspace/session/branch/file 和精确命令或内容摘要。
2. 高风险入口必须要求输入确认短语；当前 Terminal 启动要求输入 `启动终端`。
3. 确认弹框关闭前不发送请求；请求只在用户确认后触发。
4. 操作结果必须回显在对应工具面板中，失败时展示 relay 返回错误。
5. 不把 provider key、relay token、pairing payload 或其他 secret 展示在确认详情里。

## 硬约束

- `codex` 仍在 Mac 本机运行。
- `codex-relay` 仍在 Mac 本机运行，监听本机 relay 端口，例如 `127.0.0.1:8787` 或 `0.0.0.0:8787`。
- VPS 可以托管 Web 静态资源，也可以作为 frp/frps、Caddy、Cloudflare Tunnel 或 SSH reverse tunnel 的公网入口。
- 当前阶段接受 HTTP IP 入口；HTTPS 只作为未来完整 PWA、Service Worker、摄像头扫码等 secure context 能力的升级项。
- Relay API 仍必须要求 pairing/session token，不允许裸奔暴露到公网。
- CORS 只允许 PWA origin，例如 `https://app.example.com`。

## 推荐架构

```text
iPhone Safari / Home Screen PWA
  -> https://app.example.com
  -> VPS static hosting / Caddy / Nginx
  -> PWA assets

PWA API requests
  -> https://relay.example.com
  -> VPS reverse proxy / tunnel entry
  -> secure tunnel to Mac
  -> Mac codex-relay
  -> Mac Codex CLI
  -> local workspace
```

关键分工：

- PWA：只负责移动 UI、配对、会话状态、请求 relay API、展示 Codex 输出。
- VPS：只负责静态资源、反代或 tunnel 入口、基础访问防护。
- Mac relay：继续负责 pairing、session、thread、stream、approval、workspace、terminal、automation 和 Codex CLI 调用。
- Mac Codex CLI：继续保留登录态、provider 配置、模型调用和本地 workspace 执行。

这个方案解决的是“手机端长期可安装可访问”的问题，不是让 Mac 完全退出链路。Mac 仍是工作运行端，PWA 只是替换 iOS 原生开发包。

## 当前本机架构

按当前仓库和本机运维记忆，现有链路可以抽象为：

```text
iPhone 原生 App / iOS dev-client
  -> relay 公网入口，例如 http://<vps-ip>:8788
  -> VPS Caddy / public entry
  -> VPS frps
  -> Mac frpc
  -> Mac codex-relay, usually :8787
  -> Mac Codex CLI / app-server
  -> Mac 本地 workspace、git、shell、session、provider auth
```

开发安装链路另有一段：

```text
Xcode / Expo dev-client
  -> iPhone Debug App
  -> Mac Metro, often :8082
```

长期迁移时要保留第一段 local-first relay 架构，移除第二段对 Xcode、签名和 Metro 的日常依赖。也就是说：

- `codex-relay` 仍然在 Mac 上启动和管理本地 workspace。
- 现有 Mac `frpc -> VPS frps -> Caddy/public entry` 链路可以继续使用。
- 手机入口从“原生 App 调 relay API”变为“浏览器/PWA 页面调 relay API”。
- VPS 需要多承担一个静态 Web 入口，用来分发 PWA 文件。

## 无域名时的落地方式

当前没有域名时，不影响先做迁移原型，但会影响 PWA 的长期体验和浏览器能力。

### 可立即验证的 IP 入口

```text
http://<vps-ip>:8080
  PWA/Web 静态页面，首版可以只是普通网页

http://<vps-ip>:8788
  现有 relay API 公网入口，继续反代到 Mac codex-relay
```

这种方式适合 Phase 1/Phase 2 原型：

- 可以验证 Web UI、relay status、pairing、thread list、chat streaming。
- 不需要先买域名。
- 可以直接复用当前 VPS IP 和现有 relay 入口。

限制：

- 公网 HTTP 不是安全上下文，Service Worker、摄像头扫码、部分 PWA 能力和更严格的浏览器能力可能不可用或不稳定。
- iOS Safari 虽然可以把网页添加到主屏，但没有 HTTPS 时不应当作为最终长期方案。
- 如果 Web 页面是 `http://<vps-ip>:8080`，API 是 `http://<vps-ip>:8788`，需要 relay CORS 允许这个 origin。

### 推荐的无购买域名过渡方案

如果暂时不想购买域名，但希望尽快验证 HTTPS/PWA，可以使用“指向 IP 的临时 DNS 名称”作为过渡，例如：

```text
https://app.<vps-ip-as-dns-helper>
https://relay.<vps-ip-as-dns-helper>
```

这类方案的本质是：用一个能解析到 VPS IP 的公共 DNS 名称申请 HTTPS 证书。它比裸 IP 更接近最终形态，但仍依赖第三方 DNS helper，不建议作为长期生产入口。

### 临时 DNS helper + HTTPS 调研结论

推荐临时方案：

```text
https://app-<vps-ip-with-dashes>.sslip.io
  PWA 静态页面

https://relay-<vps-ip-with-dashes>.sslip.io
  relay API 入口，VPS 反代到 Mac codex-relay
```

如果 VPS IP 是 `43.143.114.214`，则可使用：

```text
https://app-43-143-114-214.sslip.io
https://relay-43-143-114-214.sslip.io
```

候选服务：

| 服务 | 用法 | HTTPS 适配 | 建议 |
| --- | --- | --- | --- |
| `sslip.io` | `app-43-143-114-214.sslip.io` 解析到 `43.143.114.214` | 可用 HTTP-01 为每个具体 hostname 签证书；不支持 wildcard 证书 | 首选 |
| `nip.io` | `app-43-143-114-214.nip.io` 解析到 `43.143.114.214` | 当前由 `sslip.io` 体系维护；同样可签具体 hostname | 备选 |
| `traefik.me` | `app.43.143.114.214.traefik.me` 或类似格式 | 主要提供 wildcard DNS；证书可由 Caddy/ACME 尝试签具体 hostname | 备选 |
| `local-ip.co` | `10-0-0-1.my.local-ip.co` | 提供共享 wildcard 证书和私钥 | 不推荐用于 relay；共享私钥不适合承载私人 Codex 入口 |

选择 `sslip.io` 的原因：

- 它直接支持把 hostname 内嵌的 IPv4/IPv6 解析成对应 IP。
- 它的文档明确说明可以为外部可访问主机通过 Let’s Encrypt HTTP-01 获取具体 hostname 的 TLS 证书。
- 它明确不支持 wildcard 证书，因此我们应为 `app-*` 和 `relay-*` 分别签具体证书。
- 它比裸 IP 更接近最终域名形态，能让 iOS Safari/PWA 进入 HTTPS secure context。

需要满足的 VPS 条件：

- VPS 的 `80/tcp` 必须能从公网访问，用于 Let’s Encrypt HTTP-01 challenge。
- VPS 的 `443/tcp` 必须能从公网访问，用于 HTTPS 服务。
- Caddy/Nginx 需要按 Host 区分 `app-*` 和 `relay-*`。
- `relay-*` 反代到当前 VPS 本地的 relay 转发端口，例如 frps 暴露出来的 `127.0.0.1:18787`。
- `app-*` 指向 PWA 静态文件目录。

Caddy 过渡配置形态：

```caddyfile
app-43-143-114-214.sslip.io {
  root * /srv/codex-relay-pwa
  try_files {path} /index.html
  file_server
}

relay-43-143-114-214.sslip.io {
  reverse_proxy 127.0.0.1:18787 {
    flush_interval -1
  }
}
```

使用这个方案时，PWA 的 relay base URL 应配置为：

```text
https://relay-43-143-114-214.sslip.io
```

风险：

- 这是第三方免费 DNS helper，不适合作为最终生产依赖。
- 证书会出现在 Certificate Transparency log，临时 hostname 不是秘密。
- 频繁重装或反复失败可能触发 Let’s Encrypt rate limit；调试 Caddy 自动 HTTPS 时应先确认 80/443、防火墙和 Host 配置。
- 如果 VPS IP 变化，hostname 也要跟着变，PWA 已保存的 relay URL 需要更新。
- 国内网络对这些公共 helper 域名的解析和访问质量需要实测。

### 2026-07-02 VPS 验证记录

已验证：

- `app-43-143-114-214.sslip.io` 解析到 `43.143.114.214`。
- `relay-43-143-114-214.sslip.io` 解析到 `43.143.114.214`。
- VPS 上 Caddy 已新增两个站点：
  - `app-43-143-114-214.sslip.io` -> `/srv/codex-relay-pwa`
  - `relay-43-143-114-214.sslip.io` -> `127.0.0.1:18787`
- VPS 本机已监听 `*:80` 和 `*:443`。
- 旧入口 `http://43.143.114.214:8788/version` 仍返回 relay 版本信息，没有被新配置破坏。

当前阻塞：

- 公网访问 `http://app-43-143-114-214.sslip.io` 的 `80/tcp` 超时。
- Caddy 日志中 Let’s Encrypt HTTP-01 报错：
  `Timeout during connect (likely firewall problem)`。
- VPS 内 `ufw` 为 inactive，iptables 默认 INPUT ACCEPT，因此主因更像云厂商安全组未放行 `80/tcp`。
- `443/tcp` 已能建立 TCP 连接，但因为证书还没有签发成功，HTTPS 暂时返回 TLS internal error。

需要在云控制台补的入口规则：

```text
Inbound TCP 80   source 0.0.0.0/0
Inbound TCP 443  source 0.0.0.0/0
```

放行后，Caddy 会自动重试签发证书；如不想等待重试周期，可以执行：

```bash
ssh oc sudo systemctl reload caddy
```

然后验证：

```bash
curl -I https://app-43-143-114-214.sslip.io
curl -I https://relay-43-143-114-214.sslip.io/version
```

继续验证结果：

- 放行后，`80/tcp` 已经公网可达，`http://app-43-143-114-214.sslip.io` 和 `http://relay-43-143-114-214.sslip.io` 都能返回 Caddy 的 `308` HTTPS 跳转。
- Caddy 能收到 Let’s Encrypt 的 HTTP-01 请求，并写出 `served key authentication` 日志。
- 证书仍未签发成功，Let’s Encrypt 返回：
  `Invalid response from https://dnspod.qcloud.com/static/webblock.html?...`
- `relay-43-143-114-214.sslip.io` 已触发 Let’s Encrypt 每小时失败授权限制：
  `too many failed authorizations (5) ... retry after 2026-07-02 02:05:17 UTC`。
- 为避免继续消耗失败次数，Caddy 已恢复到旧 `:8788` 配置；旧入口 `http://43.143.114.214:8788/version` 仍正常返回 relay 版本信息。

判断：

- `sslip.io` DNS helper 本身可以解析到 VPS。
- VPS 系统防火墙和 Caddy 基础配置不是主因。
- 当前腾讯云大陆 VPS 对未备案/临时 helper 域名的 80/443 Host 访问存在 DNSPod/webblock 干预，导致公共 ACME CA 无法完成 HTTP-01 校验。
- 在这台 VPS 上继续尝试 `sslip.io` / `nip.io` 这类临时域名，成功概率低，且会继续触发 rate limit。

下一步可选路径：

1. 换非大陆 VPS，例如香港、新加坡、日本或美国，再使用 `sslip.io` + Caddy 自动 HTTPS。
2. 购买正式域名并完成当前大陆 VPS 要求的备案/接入流程，然后用正式域名签证书。
3. 使用 Cloudflare Tunnel / ngrok / 其他托管 HTTPS tunnel 的临时域名验证 PWA；这类方案不依赖当前 VPS 直接承载 80/443 Host。
4. 仅开发验证时继续使用 `http://43.143.114.214:8788` 作为 relay API；但这不是完整 PWA secure context。
5. 低推荐：自建私有 CA 并在 iPhone 安装信任描述文件，为 IP 或私有 hostname 签证书。它可以绕过公开 CA，但需要手动信任证书，维护和安全体验都不如真实公网证书。

### 长期可选

当前用户已明确决定不要域名，直接使用 IP 实现。以下域名/HTTPS 方案仅作为未来可选项；后续实现默认不依赖域名。

如果未来要完整 PWA 能力，可以再准备一个低成本域名，因为它能同时解决：

- HTTPS 证书自动签发和续期。
- PWA secure context。
- 摄像头扫码、Service Worker、manifest、缓存策略等浏览器能力。
- 后续把 `app` 和 `relay` 分开管理。

未来可选拓扑：

```text
https://app.holy-hard.icu
  VPS 上的 PWA 静态资源

https://relay.holy-hard.icu
  VPS 反代到 Mac codex-relay
```

### `holy-hard.icu` 域名计划（已暂停）

用户曾选择使用 `holy-hard.icu` 作为入口域名，但随后明确决定不要域名，直接使用 IP 实现。本节只保留为未来恢复域名时的参考。

如未来恢复域名，建议固定为两个子域：

```text
app.holy-hard.icu
  PWA/Web 静态入口

relay.holy-hard.icu
  relay API 入口，VPS 反代到 Mac codex-relay
```

DNS 记录：

```text
Type  Name   Value
A     app    43.143.114.214
A     relay  43.143.114.214
```

可选记录：

```text
Type  Name  Value
A     @     43.143.114.214
```

2026-07-02 验证状态：

- `holy-hard.icu` 当前公共 DNS 返回 `NXDOMAIN`。
- `app.holy-hard.icu` 当前公共 DNS 返回 `NXDOMAIN`。
- `relay.holy-hard.icu` 当前公共 DNS 返回 `NXDOMAIN`。
- 因此当前不能让 Caddy 为这两个 hostname 申请证书；否则只会进入 ACME 失败重试。
- 用户随后配置了 `www.holy-hard.icu`，公共 DNS 已解析到 `43.143.114.214`。
- 当前已将 Phase 1 Web 验证页部署到 `http://www.holy-hard.icu`。
- 当前 `relay.holy-hard.icu` 仍未解析；Phase 1 Web 页继续默认使用 `http://43.143.114.214:8788` 作为 relay API。
- 随后发现 `www.holy-hard.icu` 也被 DNSPod/webblock 拦截到备案提示页，不能作为当前可用入口。
- 为继续 Phase 2，Web 静态入口已切换到裸 IP：`http://43.143.114.214/`。

如果未来恢复域名，需要先完成：

1. 确认 `holy-hard.icu` 已购买/注册成功。
2. 确认注册商 nameserver 已生效，或在当前 DNS 服务商添加上面的 A 记录。
3. 等公共 DNS 能解析到 `43.143.114.214` 后，再恢复 Caddy 的 HTTPS 站点配置。

验证命令：

```bash
curl -I http://app.holy-hard.icu
curl -I http://relay.holy-hard.icu
```

DNS 生效后，Caddy 配置应为：

```caddyfile
app.holy-hard.icu {
  root * /srv/codex-relay-pwa
  try_files {path} /index.html
  file_server
}

relay.holy-hard.icu {
  reverse_proxy 127.0.0.1:18787 {
    flush_interval -1
  }
}

:8788 {
  handle /version {
    reverse_proxy 127.0.0.1:18787
  }

  handle /v1/* {
    reverse_proxy 127.0.0.1:18787
  }

  handle /pair/* {
    reverse_proxy 127.0.0.1:18787
  }

  respond 404
}
```

注意：当前 VPS 在中国大陆。如果 `holy-hard.icu` 未完成大陆服务器所需的备案/接入要求，后续仍可能遇到和 `sslip.io` 类似的 webblock/备案拦截。若要避免这条链路，推荐把 HTTPS 入口放到非大陆 VPS 或使用 Cloudflare Tunnel 等托管 HTTPS tunnel。

### Phase 1/2 HTTP IP 部署状态

当前决策是直接使用 IP 实现，采用 HTTP-only 裸 IP 部署：

```text
http://43.143.114.214/
  VPS Caddy 静态文件
  /srv/codex-relay-pwa

http://43.143.114.214:8788
  relay API
  VPS Caddy -> 127.0.0.1:18787 -> Mac codex-relay
```

VPS Caddy 当前配置形态：

```caddyfile
:80 {
  root * /srv/codex-relay-pwa
  try_files {path} /index.html
  file_server
}

:8788 {
  handle /version {
    reverse_proxy 127.0.0.1:18787
  }

  handle /v1/* {
    reverse_proxy 127.0.0.1:18787
  }

  handle /pair/* {
    reverse_proxy 127.0.0.1:18787
  }

  respond 404
}
```

已验证：

- `http://43.143.114.214/` 返回 Phase 2 Web 页 HTML。
- `http://43.143.114.214/manifest.webmanifest` 返回 manifest。
- `http://43.143.114.214:8788/version` 返回 relay `1.2.1`。
- `http://43.143.114.214:8788/v1/status` 在未配对时返回 `401 unauthorized`，这是可达但未授权的健康信号。
- `http://43.143.114.214:8788/v1/pair/payload` 返回 `codex-relay://pair?...` pairing link。

限制：

- 这是 HTTP 验证入口，不是最终 PWA secure context。
- HTTP 页面可以调用 HTTP relay API，因此当前 Phase 2 可以继续推进。
- 摄像头扫码、Service Worker、完整 Add to Home Screen PWA 能力等 secure context 能力暂不作为当前目标。
- 若未来升级 HTTPS，不能继续从 HTTPS 页面调用 `http://43.143.114.214:8788`，否则浏览器会因 mixed content 阻止请求；届时需要同步升级 relay API 到 HTTPS。

### Phase 2 Pairing Web 状态

已实现：

- Web 页面可以从当前 relay URL 读取 `/v1/pair/payload`。
- Web 页面可以粘贴并解析 `codex-relay://pair?...` / `jlt-relay://pair?...`。
- Web 页面实现了与原生客户端一致的 secure pairing：
  - 生成 x25519 ephemeral key。
  - 发送 `clientEphemeralPublicKey` 和 `clientNonce` 到 `/v1/pair`。
  - 显示 approval code。
  - 轮询 `/v1/pair/:approvalCode`。
  - 用 ed25519 验证 server signature。
  - 解密 secure payload，保存 `clientToken`、过期时间和 secure session。
- 配对成功后，状态页会带 `Authorization: Bearer <token>` 和 `x-codex-relay-client-session-id` 重新探测 `/v1/status`。

当前入口：

```text
http://43.143.114.214/
```

操作方式：

1. 手机或浏览器打开 `http://43.143.114.214/`。
2. 点击“从 Relay 读取”，页面会自动读取 pairing link 并发起配对。
3. 页面显示 approval code 后，在 Mac relay 侧 approve。
4. 页面等待轮询成功后，状态应从“需要配对”变为“已连接”。

## 备选方案取舍

| 方案 | 描述 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- | --- |
| A | VPS IP 托管 Web，`8788` 反代到 Mac relay | 不依赖域名/证书，手机只用浏览器，当前可用 | 不是 HTTPS secure context | 当前采用 |
| B | VPS 托管 PWA，Mac relay 通过 Tailscale/Cloudflare Tunnel/frp 暴露 | 与当前远程 relay 经验相容，安全边界清晰 | 依赖 tunnel 稳定性 | 推荐作为 A 的实现方式 |
| C | Mac relay 同时 serve Web，再由 VPS 反代 | 前后端同源更简单，版本一致性好 | Mac 不在线时 PWA shell 也不可用 | 可作为后续优化 |
| D | 重写原生 iOS App | 原生体验最好 | 仍然绕不开签名和 7 天过期 | 不作为主路径 |
| E | VPS 运行 Codex 和 relay | 手机访问最稳定 | 违背“codex 和 relay 仍在 Mac 本机运行”，且涉及代码/密钥上云 | 本轮不采用 |

当前采用 A 的 IP HTTP 形态：Web 静态资源放 VPS 的 `:80`，relay API 通过 VPS 的 `:8788` 转发到 Mac 本机 relay。HTTPS/tunnel 只作为未来可选升级。

## URL 拓扑建议

当前主线直接使用 IP：

```text
http://43.143.114.214/
  Web 静态资源

http://43.143.114.214:8788
  relay API，反代到 Mac codex-relay
```

当前不再等待域名、临时 DNS helper 或 HTTPS 证书。后续 Phase 2/3 默认基于这两个 IP URL 实现。

未来如果恢复 HTTPS，可以再使用两个域名或同域不同 path：

```text
https://app.example.com
  PWA 静态资源

https://relay.example.com
  反代到 Mac codex-relay
```

两域名更清晰，CORS 和缓存策略也更容易分开。单域名 path 更容易规避 CORS，但要小心 `/v1/workspace/web-preview`、SSE 和静态资源缓存规则互相影响。

## 功能等价矩阵

| 现有功能 | 当前移动端位置/API | PWA 迁移方式 | 等价度 | 备注 |
| --- | --- | --- | --- | --- |
| 配对二维码/链接 | `PairRequestSchema`、`PairingPayloadResponseSchema`、`secure-transport` | Web 端实现 pairing link/parser，支持扫码、粘贴、URL 参数唤起 | 高 | iOS PWA 无法处理自定义 scheme，但可以处理 HTTPS pair URL 和手动粘贴 |
| Relay 状态检查 | `/v1/status`、`/version` | PWA 首屏状态页调用 relay status/version | 高 | 未授权 `401` 可作为公网链路可达信号 |
| 线程列表 | `/v1/threads` | React Query 或等价缓存拉取 | 高 | 复用 `ThreadSummary` |
| 聊天详情 | `/v1/threads/:id`、message detail | Web timeline 组件重建 | 高 | Markdown、代码块和附件展示需要 Web 组件 |
| 新建/继续线程 | `/v1/threads`、`/v1/threads/:id/runs` | 表单提交到 relay API | 高 | 请求 schema 复用 |
| 流式输出 | `/v1/threads/:id/runs/stream` | 浏览器 `EventSource` 或 fetch stream | 高 | 需要确认反代不缓冲 SSE |
| 中断运行 | `/v1/threads/:id/runs/interrupt` | 按钮调用 API | 高 | 与现有行为一致 |
| 等待输入/排队输入 | queued input APIs | PWA 实现 pending input banner 和 steer/submit 操作 | 高 | 需复刻现有交互 |
| 审批请求 | `/v1/approvals/:id` | PWA 审批卡片，支持 approve/deny/session | 高 | 高风险操作要保留明确确认 |
| Runtime preferences | `/v1/preferences`、models、skills、rate limits | PWA settings 页面重建 | 高 | key 仍留 Mac，不在 PWA 输入 |
| 工作区目录 | `/v1/workspace-directories` | Web 端目录选择器 | 高 | 与 relay schema 对齐 |
| Git changes | `/v1/workspace/changes` | Web diff/change list | 中高 | 初期可先列表，后续补 diff 细节 |
| 文件搜索/查看 | `/v1/workspace/files`、`/v1/workspace/file` | Web file browser/editor | 高 | 注意大文件和编码提示 |
| 文件编辑 | `UpdateWorkspaceFileContentRequest` | 文本编辑器调用更新 API | 中高 | 需要 dirty state、保存确认、冲突提示 |
| Web preview | `/v1/workspace/web-preview/:port` | iframe 打开 relay proxy | 中高 | 需要 CSP、cookie、混合内容、端口选择处理 |
| Terminal | workspace terminal APIs | xterm.js 或简单 terminal panel | 中 | 第一阶段可做只读输出，后续补输入、resize、stream |
| Automations | `/v1/automations` | 列表和运行按钮 | 中高 | 低频但 API 已存在 |
| 图片附件 | `/v1/attachments/images` | `<input type="file" accept="image/*">` 或相册/拍照 | 高 | iOS Safari 支持文件选择和相机入口 |
| 图片查看 | image attachment API | Web lightbox | 高 | 可复刻 `image-viewer` |
| QR 扫码 | 原生相机/Expo | `getUserMedia` + Web QR parser，失败则粘贴 | 中 | iOS PWA 摄像头权限和兼容性需实测 |
| Haptics | 原生 haptics | Web 无法完全等价 | 低 | 可用视觉状态和轻量动画替代 |
| 原生 bottom sheet | `AppBottomSheet` | Web drawer/sheet 组件 | 中高 | 视觉复刻，不追求原生手势完全一致 |
| SecureStore/MMKV | native storage | IndexedDB/localStorage 或 httpOnly cookie | 中 | 需要单独安全设计 |

## PWA 信息架构

建议首版保留现有移动端心智模型：

1. Pair/Connect
   - 输入或扫描 pairing link。
   - 显示候选 relay URL。
   - 展示 approval code 和连接状态。

2. Chat
   - 线程列表 drawer。
   - 当前线程 timeline。
   - composer 支持文本、图片、运行参数。
   - streaming、interrupt、pending input、approval 卡片。

3. Workspace
   - git changes。
   - file search/list。
   - file editor。
   - web preview。
   - terminal。

4. Settings
   - relay URL。
   - session/sign out。
   - runtime preferences。
   - model/skill/rate limit/context window。

第一阶段不要做营销 landing page。手机打开后应直接进入连接状态或最近会话。

## 协议兼容策略

1. Web 端直接依赖 `codex-relay/api-schema` 的类型和 Zod schema。
2. 网络层抽出一个 Web 版本 relay client，不复用 React Native 专用 transport：
   - 用浏览器 `fetch` 代替 `react-native-direct-fetch` / `react-native-nitro-fetch`。
   - 用浏览器 `EventSource` 或 fetch stream 代替 `react-native-sse`。
   - 用 WebCrypto 代替 native crypto 依赖，或把现有 secure transport 抽成跨平台实现。
3. Pairing parser 从移动端抽到共享包，至少支持：
   - `codex-relay://pair?...`
   - `jlt-relay://pair?...`
   - `https://relay.example.com/pair?...`
   - 原始 JSON payload，例如 `{ "serverUrl": "...", "serverUrls": [...], "serverPublicKey": "..." }`
4. Web client 保存 `serverUrl`、`serverUrlCandidates`、`clientSessionId`、`clientToken`、过期时间和 pairing 状态。
5. 所有 API error 继续按 relay 的 `ErrorResponse` 解析，避免 Web 端发散出另一套错误模型。

## 安全设计

### 必须保持的边界

- provider key、Codex 登录态、`~/.codex`、workspace 文件和 git 凭据留在 Mac。
- VPS 不保存 provider key，不持久化 workspace 内容。
- PWA 只保存 relay session token 或浏览器 session cookie。
- Relay 公网入口必须有 pairing/session 验证。

### 推荐防护

1. HTTPS 强制开启，PWA 和 relay API 都不走明文公网 HTTP。
2. Relay API CORS 只允许 PWA origin。
3. VPS 到 Mac 使用 frp、Cloudflare Tunnel、Tailscale、SSH reverse tunnel 中的一种，并启用各自的 token/ACL。
4. Relay API 可额外加外层访问保护：
   - Caddy Basic Auth。
   - Cloudflare Access。
   - Tailscale Funnel/ACL。
   - IP allowlist，若手机网络环境固定。
5. SSE 和 terminal 反代要设置长连接超时，关闭响应缓冲。
6. Service Worker 不缓存 API 响应、thread 内容、terminal 输出和 workspace 文件。
7. PWA 静态资源可以长期缓存，但 HTML 和 manifest 应短缓存，避免旧客户端卡住。

### Web token 存储取舍

| 方式 | 优点 | 风险 | 建议 |
| --- | --- | --- | --- |
| localStorage | 实现简单，可离线保留登录 | XSS 后 token 可读 | MVP 可用，但必须严格 CSP |
| IndexedDB | 容量和结构更好 | XSS 后仍可读 | 适合保存客户端状态 |
| httpOnly cookie | JS 不可读，XSS 风险更低 | 需要 relay 支持 cookie session 和 CSRF 防护 | 中长期推荐 |
| sessionStorage | 关闭浏览器后清理 | PWA 使用体验差 | 不推荐作为默认 |

首版可以先沿用 token header 模型，使用 IndexedDB/localStorage 存储；上线前必须补 CSP、无内联脚本、依赖审计和 XSS 入口检查。中长期再改成 httpOnly cookie session。

## VPS 与 Mac 转发方案

### 方案 B1：frp/frps

适合当前已有 frpc/frps 运维经验的环境。

```text
Mac codex-relay :8787
  -> frpc
  -> VPS frps
  -> VPS local port, for example 18787
  -> Caddy HTTPS relay.example.com
```

优点：

- 与现有 JLT Relay remote access 经验一致。
- VPS 可以统一做 HTTPS 和公网入口。
- Mac 不需要公网 IP。

注意：

- frp token 不写入仓库。
- Caddy 反代要支持 SSE 长连接。
- Mac 网络/VPN 切换后需要健康检查恢复 frpc。

### 方案 B2：Cloudflare Tunnel

优点：

- HTTPS 和公网入口成熟。
- 可以叠加 Cloudflare Access。
- 不需要 VPS 直接暴露端口。

注意：

- 国内网络环境和访问稳定性需要实测。
- 如果 PWA 静态资源仍在 VPS，域名和证书策略要统一。

### 方案 B3：Tailscale/Funnel

优点：

- ACL 清晰，设备间访问安全。
- 适合私人使用。

注意：

- iPhone 可能需要 Tailscale App 或 Funnel 配置。
- 若目标是完全浏览器打开，Funnel 可用性需要验证。

### 方案 B4：SSH reverse tunnel

优点：

- 依赖少，容易快速验证。

注意：

- 长期稳定性和自愈需要额外脚本。
- 不如 frp/Cloudflare/Tailscale 易管理。

## 建议仓库结构

```text
apps/
  mobile/
    现有 Expo React Native 客户端，短期保留
  web/
    Vite + React + TypeScript PWA
    src/
      app/
      components/
      lib/
      state/
      styles/
    public/
      manifest.webmanifest
      icons/

packages/
  codex-relay/
    现有 Hono relay server 和 api-schema
  relay-client/
    可选：跨平台 relay client、pairing parser、SSE parser、storage adapter 接口
```

首版可以先把 Web client 放在 `apps/web/src/lib`，等 RN/Web 代码重复变明显后再抽 `packages/relay-client`。不要一开始就抽大而全共享包。

## 实施阶段

### Phase 0：冻结迁移边界

产物：

- 本文档。
- 确认域名和 VPS 入口规划。
- 确认 Mac relay 的长期启动方式。

验收：

- 明确 `app.example.com` 和 `relay.example.com` 的最终映射。
- 明确 tunnel 技术选择。
- 明确 PWA 不替代 Mac relay，只替代 iOS 原生壳。

### Phase 1：PWA Shell 与连接状态

实现：

- 新增 `apps/web`。
- 配置 Vite React TypeScript。
- 配置 manifest、icons、Service Worker 基础策略。
- 首屏连接状态页。
- relay URL 输入、保存、候选 URL。
- `/version` 和 `/v1/status` 探测。

验收：

- iPhone Safari 能打开 PWA。
- 可以 Add to Home Screen。
- PWA 可显示 relay reachable / unauthorized / unavailable 三种状态。
- 不需要 Xcode、Metro 或 iOS dev-client。

### Phase 2：Pairing 和 Chat MVP

实现：

- Web pairing parser。
- 支持粘贴 pairing link。
- 可选支持摄像头扫码。
- 完成 pairing approval flow。
- 线程列表、线程详情、创建线程、发送 prompt。
- SSE streaming、interrupt、pending input。

验收：

- 手机 PWA 能与 Mac relay 完成配对。
- 新建线程并看到 Codex 流式输出。
- Codex 要求输入时，PWA 能提交继续内容。
- Mac relay 重启后，PWA 能恢复或明确提示重新连接。

### Phase 3：主要功能等价

实现：

- approval card。
- settings 和 runtime preferences。
- models、skills、rate limits、context window。
- 图片附件上传和图片查看。
- workspace directory、git changes、file list、file editor。
- web preview iframe。

验收：

- 日常手机操作不需要再打开原生 dev build。
- 文件查看/编辑有保存确认和错误提示。
- web preview 可以查看 Mac 本地服务。
- approval 操作有明确风险提示。

### Phase 4：Terminal 与自动化

实现：

- terminal session list/start/output。
- terminal input 和 resize。
- terminal output stream。
- automations list/run。

验收：

- PWA 中能启动或查看 workspace terminal。
- 长连接经过 VPS 反代不会被提前断开。
- automation 可以被触发，并能看到结果或错误。

### Phase 5：部署硬化和日常切换

实现：

- VPS 部署脚本。
- Caddy/Nginx 配置。
- tunnel 健康检查。
- PWA 版本提示。
- Service Worker 缓存策略。
- CSP 和安全 header。
- 基础监控和恢复说明。

验收：

- iPhone 主屏 PWA 作为日常入口。
- 原生 iOS dev build 只保留为实验/回归参考。
- Mac 侧 relay 自愈脚本和 VPS 入口健康检查能定位故障段。

## 反代配置要点

无论使用 Caddy 还是 Nginx，都要保证：

- `/v1/threads/*/runs/stream` 不被缓冲。
- `/v1/workspace/terminal/*/stream` 不被缓冲。
- 连接超时足够长。
- WebSocket 如果后续引入，需要升级头。
- 上传图片大小限制合理。
- API 响应不被 Service Worker 缓存。

Caddy 方向示例：

```caddyfile
app.example.com {
  root * /srv/codex-relay-pwa
  try_files {path} /index.html
  file_server

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
  }
}

relay.example.com {
  reverse_proxy 127.0.0.1:18787 {
    flush_interval -1
  }
}
```

上面只是拓扑示例，真实端口取决于 frp/tunnel 配置。

## 验收总清单

迁移完成必须同时满足：

1. iPhone Safari 可访问 PWA，并能添加到主屏。
2. 删除原生开发包后，仍可完成主要 Codex Relay 工作流。
3. 不需要 Mac 上启动 Metro。
4. 不需要 Xcode 重新安装。
5. Mac 上仍运行 `codex` 和 `codex-relay`。
6. PWA 通过 VPS HTTPS 入口访问 Mac relay。
7. pairing/session token 仍然生效，未配对设备不能访问敏感 API。
8. 聊天流式输出、pending input、approval、thread list、settings 可用。
9. workspace 文件、git changes、web preview 至少达到可日常使用水平。
10. tunnel 或 relay 断开时，PWA 有明确错误状态，不静默失败。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| VPS 到 Mac tunnel 不稳定 | 手机无法访问 relay | 沿用现有 healthcheck，分段检查本机 relay、frpc/frps、VPS 入口、公网 HTTPS |
| SSE 被反代缓冲 | 流式输出变成批量输出或超时 | Caddy/Nginx 禁用 buffering，设置长超时 |
| PWA token 被 XSS 读取 | relay session 泄露 | CSP、依赖审计、禁止内联脚本，中长期迁移 httpOnly cookie |
| iOS Safari PWA 限制 | 扫码、后台、通知体验不如原生 | 提供粘贴 pairing link，关键工作流不依赖后台常驻 |
| Web UI 与原生 UI 分叉 | 维护成本上升 | 先复用 API/schema 和视觉结构，后续抽 shared client，而不是复制协议 |
| Web preview iframe 被 CSP/跨域阻断 | 预览不可用 | 通过 relay proxy 同源或专用 preview origin，明确 CSP 例外 |
| Terminal 长连接耗电/断线 | terminal 体验差 | 初期只读输出，后续补心跳、重连、scrollback 和 session 恢复 |

## 未决问题

1. 最终域名是什么：`app.*` / `relay.*`，还是单域名 path？
2. VPS 到 Mac 的 tunnel 选 frp、Cloudflare Tunnel、Tailscale 还是 SSH reverse tunnel？
3. PWA 静态资源由 VPS 直接托管，还是由 Mac relay 构建后同步到 VPS？
4. Web token 首版使用 localStorage/IndexedDB，还是直接改 relay 支持 httpOnly cookie session？
5. 是否需要从第一版就支持扫码，还是先支持粘贴 pairing link？
6. Terminal 是否进入 MVP，还是延后到主要聊天和 workspace preview 稳定后再做？

## 推荐下一步

1. 先选定 URL 拓扑和 tunnel 技术。若沿用当前环境，优先选 `VPS Caddy + frp/frps + Mac relay`。
2. 新增 `apps/web`，只做 Phase 1 的 PWA shell 和 relay 状态页。
3. 把 pairing parser 和 Web relay client 做成最小可测模块。
4. 用 iPhone Safari 验证 Add to Home Screen、HTTPS、状态探测和未授权健康信号。
5. Phase 1 验收通过后，再进入 Chat MVP，而不是一次性重写全部移动端。
