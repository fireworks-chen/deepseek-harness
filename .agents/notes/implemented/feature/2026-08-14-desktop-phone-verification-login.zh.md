# Agent Note: 桌面端手机号验证码登录

Status: implemented

[English](2026-08-14-desktop-phone-verification-login.md) | 中文

## Problem

Electron 外壳需要通过 Shopwis 服务完成手机号验证码登录。凭据和返回的 Token 会经过渲染进程到主进程的边界，内置 Harness 后端只在认证成功后启动。如果把 HTTP、持久化、IPC 解析和窗口生命周期放在同一个模块中，后续增加桌面账户接口时难以安全扩展。

Shopwis 的模型、Tool 和 Skill 集成以后可能成为独立 Harness 能力，但本次变更没有任何对应业务操作。把桌面登录放进工作区包会让不应发送短信验证码或创建用户会话的运行时接触认证职责。

## Decision

桌面登录表单通过隔离的 preload 桥接发送手机号和验证码。Electron 主进程负责所有 Shopwis 请求、Token、加密持久化、后端启动和退出登录。

桌面端模块分别承担以下职责：

- `src/api/http-client.ts` 负责 HTTPS 根地址、JSON 传输、超时、可选 Bearer 鉴权、通用 `code` 和 `msg` 处理、响应校验和统一错误；
- `src/auth/auth-api.ts` 只负责 `POST /api/v1/company/user/send/sms/code` 和 `POST /api/v1/company/user/sms/login`；
- `src/auth/auth-service.ts` 将成功响应中的服务端身份映射为桌面外壳公开的账户字段；
- `src/auth/session-manager.ts` 是内存 Token 的唯一所有者和 Token Provider；
- `src/auth/session-storage.ts` 使用 Electron `safeStorage` 加密记住的会话；并且
- `src/ipc/` 解析渲染层输入，并协调登录、账户和退出操作。

登录和短信请求会显式关闭 Bearer 鉴权。未来需要登录的桌面接口默认通过同一个客户端启用鉴权，因此每次请求都会在发送前读取当前 Token。在出现具体业务消费方之前，不增加 Shopwis 工作区包、Cordis 服务、Tool、Skill 或 Agent API 配置。

`SHOPWIS_AUTH_BASE_URL` 覆盖认证服务根地址。`desktop.config.json` 使用 `https://client-test.shopwis.cn` 作为回退值。`SHOPWIS_CLIENT_BASE_URL` 保持独立，只负责《服务条款》和《隐私政策》的站点链接。

登录响应提供界面显示的姓名、公司、手机号和头像。余额数据缺失时保持缺失状态；“我的金币”操作仍然可用，但不会显示虚构数字。

## Session validity

渲染层永远不会取得 Token。只有加密数据包含 `shopwis` Provider 标记、非空 Token、有效账户映射和有效可选过期时间时，记住的会话才会被接受。旧模拟会话和损坏文件会在工作区启动前删除。

当 Token 是带整数 `exp` 声明的 JWT 时，主进程会记录过期时间，拒绝恢复已经过期的会话，并在声明到期时安排退出登录。不透明 Token 在本地保持有效，直到 Shopwis 服务拒绝受保护请求。Token 缺失或 HTTP 401 会进入同一个单次退出流程，清除持久化、停止内置后端并加载登录表单。

认证 Token 只通过现有 `DSH_DESKTOP_ACCESS_TOKEN` 环境项传给内置后端进程。本次变更不会为该值安装 Harness 消费方。

## Error handling

空输入会在渲染层、IPC 解析器和认证操作中被拒绝。HTTP 状态失败、Shopwis 业务码、无效成功数据和网络失败都会转换为面向用户的错误，且不包含 Token、验证码、请求体或原始响应体。

外部导航继续只允许 HTTPS URL。认证根地址必须是不含凭据、路径、查询或片段的 HTTPS Origin；无效部署配置会在桌面端启动时直接失败。

## Testing

定向测试覆盖准确的短信和登录请求体、公开请求不携带 Bearer 请求头、响应到账户映射、Token 缺失、业务失败、响应校验、加密会话解析、JWT 过期、401 失效、网站与认证服务独立配置、渲染层提交，以及不显示虚构余额的账户界面。桌面端类型检查、lint、生产构建、React 诊断和组装后的 Electron 启动验证完整边界。

## Alternatives considered

**在真实 Provider 旁保留宽松模拟 Provider。**不采用，因为打包版本可能意外选择或恢复模拟认证，而且运行时账户数据不具备权威性。

**把 Shopwis 登录放进新的工作区包。**不采用，因为当前只有 Electron 产品消费这些接口。登录、`safeStorage`、窗口导航和后端启动属于同一个桌面生命周期；抽取后会产生没有独立运行时消费方的包。

**公开通用 Shopwis 请求 Tool。**不采用，因为登录不能由模型调用，未来业务 Tool 需要明确服务端操作、参数 Schema、权限执行和脱敏后的日志结果。

**从渲染层直接调用 Shopwis。**不采用，因为渲染层将拥有网络权限并可能观察 Token，从而削弱上下文隔离，并使退出登录协调不可靠。

## Consequences

桌面端拥有可复用的内部 HTTP 层，同时不会在业务操作出现前提前承诺 Harness 能力。新增受保护桌面接口只需要在现有客户端上增加领域模块。

登录响应不提供过期时间或刷新 Token，因此不透明 Token 的本地过期时间不可知。它们依赖受保护的 Shopwis 响应返回 401；未来的刷新或校验接口应由会话所有者负责，并且可以在不修改渲染层的情况下替换该规则。

未来模型、Tool 或 Skill 集成必须建立独立 Shopwis 能力，并且不能导入桌面登录或会话持久化。在公开高权限业务操作前，优先采用有范围限制的 Agent Token 交换。
