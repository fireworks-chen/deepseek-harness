# Agent Note: Phone verification login for the desktop shell

Status: implemented

English | [中文](2026-08-14-desktop-phone-verification-login.zh.md)

## Problem

The Electron shell requires phone-verification login against the Shopwis service. Credentials and the returned token cross a renderer-to-main-process boundary, while the embedded Harness backend starts only after authentication. Putting HTTP, persistence, IPC parsing, and window lifecycle in one module would make later desktop account APIs difficult to add safely.

Shopwis model, tool, and skill integrations may become separate Harness capabilities, but no such business operation exists in this change. Moving desktop login into a workspace package would expose authentication concerns to runtimes that must not send SMS codes or create user sessions.

## Decision

The desktop login form sends phone and verification-code input through the isolated preload bridge. The Electron main process owns every Shopwis request, the token, encrypted persistence, backend startup, and logout.

Desktop-owned modules have separate responsibilities:

- `src/api/http-client.ts` owns HTTPS origins, JSON transport, timeouts, optional bearer authentication, common `code` and `msg` handling, response validation, and normalized errors;
- `src/auth/auth-api.ts` owns only `POST /api/v1/company/user/send/sms/code` and `POST /api/v1/company/user/sms/login`;
- `src/auth/auth-service.ts` maps the successful server identity into the account fields exposed by the desktop shell;
- `src/auth/session-manager.ts` is the sole in-memory token owner and token provider;
- `src/auth/session-storage.ts` encrypts remembered sessions with Electron `safeStorage`; and
- `src/ipc/` parses renderer input and coordinates login, account, and logout operations.

Login and SMS requests explicitly disable bearer authentication. Future protected desktop APIs use the same client with authentication enabled by default, so each request resolves the current token immediately before dispatch. No Shopwis workspace package, Cordis service, tool, skill, or agent API configuration is introduced until a concrete business consumer exists.

`SHOPWIS_AUTH_BASE_URL` overrides the authentication origin. `desktop.config.json` carries `https://client-test.shopwis.cn` as the fallback. `SHOPWIS_CLIENT_BASE_URL` remains independent and owns only the service-agreement and privacy-policy website links.

The login response supplies the displayed name, company, phone, and avatar. Missing balance data remains absent; the My coins action stays available without rendering a fabricated number.

## Session validity

The renderer never receives the token. A remembered session is accepted only when its encrypted data contains the `shopwis` provider marker, a non-empty token, a valid account projection, and a valid optional expiry. Old mock sessions and malformed files are deleted before workspace startup.

When the token is a JWT with an integer `exp` claim, the main process records the expiry, rejects an already-expired restored session, and schedules logout when the claim expires. Opaque tokens remain valid locally until the Shopwis service rejects a protected request. A missing token or HTTP 401 invokes the same single-flight logout path, clears persistence, stops the embedded backend, and loads the login form.

The authenticated token is passed only to the embedded backend process through its existing `DSH_DESKTOP_ACCESS_TOKEN` environment entry. This change does not install a Harness consumer for that value.

## Error handling

Blank input is rejected in the renderer, IPC parser, and authentication operation. HTTP status failures, Shopwis business codes, invalid success data, and network failures become user-facing errors without including the token, verification code, request body, or raw response body.

External navigation remains restricted to HTTPS URLs. The authentication origin must be an HTTPS origin without credentials, path, query, or fragment, and invalid deployment configuration fails during desktop startup.

## Testing

Focused tests cover the exact SMS and login request bodies, public requests without bearer headers, response-to-account mapping, missing tokens, business failures, response validation, encrypted-session parsing, JWT expiry, 401 invalidation, independent website and authentication origins, renderer submission, and account display without a fabricated balance. Desktop type checking, lint, production builds, React diagnostics, and an assembled Electron launch verify the complete boundary.

## Alternatives considered

**Keep the permissive mock provider beside the real provider.** Rejected because a packaged build could select or restore mock authentication accidentally, and runtime account data would not be authoritative.

**Put Shopwis login in a new workspace package.** Rejected because only the Electron product currently consumes these endpoints. Login, `safeStorage`, window navigation, and backend startup are one desktop lifecycle; extracting them would create a package without an independent runtime consumer.

**Expose a generic Shopwis request tool.** Rejected because login must not be model-callable, and future business tools require explicit server operations, argument schemas, permission enforcement, and redacted logged results.

**Call Shopwis directly from the renderer.** Rejected because the renderer would own network authority and could observe tokens, weakening context isolation and making logout coordination unreliable.

## Consequences

The desktop has a reusable internal HTTP layer without committing to a Harness capability before its business operations exist. Adding a protected desktop endpoint requires only a domain module over the existing client.

Opaque tokens have no locally knowable expiry because the login response supplies no expiry or refresh token. They rely on a protected Shopwis response to report 401; a future refresh or validation endpoint belongs to the session owner and can replace that rule without changing the renderer.

Future model, tool, or skill integration must introduce a separate Shopwis capability and must not import desktop login or session persistence. A scoped agent-token exchange is preferred before exposing privileged business operations.
