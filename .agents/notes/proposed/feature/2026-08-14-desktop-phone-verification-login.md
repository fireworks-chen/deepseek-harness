# Agent Note: Phone verification login for the desktop shell

Status: proposed

English | [中文](2026-08-14-desktop-phone-verification-login.zh.md)

## Problem

The Electron shell presents an email-and-password form, while the intended client entry uses a phone number and verification code. The production authentication API is not available yet, but the desktop application still needs a realistic login presentation and a stable integration point that does not require another renderer rewrite when the API arrives.

The service agreement and privacy policy share one deployment-specific website origin. Repeating the test origin in renderer code would make production packaging error-prone. The account menu also renders Personal profile, Team management, and My coins as non-interactive rows even though they represent future navigation destinations.

## Proposal

Replace the desktop login form with the approved phone-verification layout:

- the heading reads “欢迎登录用户端”, with “登录用户端” using the configured accent color;
- the subtitle reads “要出海·有货就能出海”;
- the form contains phone and verification-code fields, a Get code action, the agreement sentence, and one Login button;
- the service agreement and privacy policy open in the system browser; and
- the form preserves keyboard submission, visible focus, loading, and error states.

The renderer sends `phone`, `verificationCode`, and `remember: true` through the existing isolated preload bridge. The bridge also exposes `requestVerificationCode(phone)`. The mock provider accepts any non-empty trimmed phone and verification code. Its code-request operation performs no external request and returns a successful retry interval so the renderer can exercise the same disabled/countdown state that the real provider will use.

`SHOPWIS_CLIENT_BASE_URL` overrides the website origin at Electron runtime. `desktop.config.json` carries `https://client-test.shopwis.cn` as the development and packaged fallback. Configuration loading requires an HTTPS origin, removes trailing slashes, and derives `/user-agreement` and `/privacy-policy` URLs for the public bootstrap payload. The same origin can become the default API origin when the production endpoints are supplied, but this proposal does not invent API paths.

Personal profile, Team management, Settings, My coins, and Sign out are all buttons. Personal profile, Team management, and My coins intentionally have no navigation side effect until their destinations exist. Settings continues to open the existing settings panel, and Sign out continues to stop the embedded backend and return to the login form.

## Data flow

The main process owns configuration, URL validation, mock authentication, session persistence, and external-navigation policy. The preload exposes typed bootstrap, code-request, login, account, and logout operations. The renderer owns field state, validation feedback, the request countdown, legal-link presentation, and submission progress.

The real authentication integration replaces the mock provider behind the same operations. It may add server response fields to the provider implementation, but the renderer continues to consume normalized success and error results.

## Error handling

Blank phone or verification-code values are rejected in the renderer and again at the IPC input parser. A code request with a blank phone shows an inline error and does not enter the countdown. Provider failures preserve the entered values and render the returned message in the existing live error region.

An invalid or non-HTTPS client base URL fails during desktop startup instead of silently emitting unsafe links. External navigation remains limited to HTTPS URLs through Electron's `setWindowOpenHandler`.

## Testing

Focused tests cover environment override and fallback URL derivation, invalid origins, mock acceptance of arbitrary non-empty credentials, IPC field validation, legal-link targets, code-request state, form submission, and account-menu button semantics. Desktop type checking, renderer build, React diagnostics, and an Electron visual pass verify the assembled result.

## Alternatives considered

**Keep email and password behind a phone-styled renderer.** Rejected because the UI and IPC types would describe different credentials, forcing another cross-process migration when the real API arrives.

**Bypass the main process and treat the form as renderer-only navigation.** Rejected because it would bypass token creation, session persistence, permissions, and embedded-backend startup.

**Hardcode the test website in the renderer.** Rejected because packaged builds would require source edits to change environments and could ship test policy links by mistake.

## Acceptance criteria

- The login window visually follows the approved phone-verification form and remains usable at the desktop minimum window size.
- Any non-empty phone and verification code can complete local mock login.
- Get code is interactive without contacting an external service.
- Both policy links use the configured HTTPS client origin and open outside Electron.
- Personal profile, Team management, and My coins are clickable no-op buttons; Settings and Sign out retain their existing behavior.
- The authentication provider can be replaced without changing the renderer field model.

## Risks

The permissive mock accepts credentials that production must reject. The mock behavior remains confined to the explicit `mock` provider and must not survive when a network provider is selected.

Runtime environment overrides are unavailable when a packaged app is launched without that environment. The validated config fallback therefore remains required for packaged distributions.
