# Kaleidoscope Codebase Audit (Post-Pull Refresh)

**Date:** 2026-03-09  
**Scope:** `c:\Code\kaleidoscope` monorepo (current pulled `master`)  
**Auditor:** GitHub Copilot (GPT-5.3-Codex)

---

## Executive Summary

The recent hardening work has now been extended to the performance endpoint: URL validation, normalized error payloads, and strict device validation are aligned with the rest of the backend API.

Backend security/contract hardening is in a good state, and the remaining risk profile is primarily frontend regression stability plus minor policy clarity around performance audit `sourceDir` handling.

**Overall health:** Good foundation with medium-low operational risk; remaining work is mostly test/consistency cleanup.

---

## Verification Snapshot

### Confirmed Passes

1. `server` TypeScript check passes (`npm run check`).
2. `server` tests pass (`npm test`, 9/9).
3. `server` includes request ID plumbing and normalized error helper in core path:
	- `server/index.ts`
	- `server/utils/http.ts`
	- `server/routes/proxy.routes.ts`
	- `server/routes/screenshot.routes.ts`
	- `server/routes/crawl.routes.ts`
	- `server/routes/performance.routes.ts`
4. Previously failing frontend tests now pass in focused rerun:
	- `mosaic-client/src/tests/crawl-api-contract.test.ts`
	- `mosaic-client/src/tests/screenshot-flow.test.tsx`

### Confirmed Gaps

1. Full frontend suite was not re-run after the targeted fixes; only the two previously failing tests were verified.
2. `sourceDir` policy for performance audits remains permissive and should be made explicit.

---

## Findings (Ordered by Severity)

### Medium

#### M1. `sourceDir` sanitization logic is insufficiently explicit
**Location:** `server/routes/performance.routes.ts`  
**Evidence:** Uses `path.resolve()` plus `!resolved.includes('..')`, which is ineffective after resolve normalization.  
**Risk:** Intent is unclear and may be misinterpreted as robust traversal prevention.  
**Recommendation:** Define explicit policy: absolute existing directory only, optional allowlist root, and no ad hoc `..` string checks.

#### M2. Frontend tests recently regressed against expected contracts
**Location:**
- `mosaic-client/src/tests/crawl-api-contract.test.ts`
- `mosaic-client/src/tests/screenshot-flow.test.tsx`

**Evidence:** Full test run reports:
1. Missing expected cross-link edge in crawl layout.
2. Screenshot selection test still querying `Pixel 6` while UI now shows `Google Pixel 6`.

**Risk:** Behavioral drift between feature evolution and test fixtures; release confidence reduced.  
**Recommendation:** Update implementation or tests so contract/UI labels are consistent and deterministic.

---

## Resolved Since Prior Audit

1. Production CORS is fail-closed when `CORS_ORIGIN` is unset (`server/index.ts`).
2. Request body limits and API rate limiting are implemented (`server/index.ts`).
3. Shared URL and cookie validation exists for proxy/crawl/screenshot paths (`server/utils/security.ts`).
4. Normalized API error helper and request IDs are in place (`server/utils/http.ts`, `server/index.ts`).
5. Shared device catalog adoption has been implemented across major layers (`shared/devices.ts`).
6. Backend security + validation tests exist and pass (`server/utils/security.test.ts`, `server/routes/validation.integration.test.ts`).
7. Performance route now uses shared URL validation (`isAllowedHttpUrl`) and normalized errors (`sendError`) with request IDs.
8. Performance route now validates device IDs against canonical shared IDs and exposes `validDeviceIds` on invalid input.

---

## Priority Roadmap (Delta-Oriented)

### Phase 1 (Immediate)
1. Complete.
2. Complete.
3. Complete.

### Phase 2 (Stability)
1. Resolve failing frontend tests and lock expected labels/contracts.
2. Introduce performance-route-specific tests for `sourceDir` policy behavior.
3. Convert remaining `console.error` paths in route handlers to structured logger usage.

---

## Acceptance Criteria for Next Audit Cycle

1. Complete: all URL-entry routes (`proxy`, `crawl`, `screenshots`, `performance`) share the same SSRF validator.
2. Complete: route errors in the hardened paths include `{ error, requestId }`.
3. Complete: performance endpoint rejects unknown device IDs with 400 and valid ID list.
4. In progress: run full frontend unit suite to confirm no additional regressions beyond targeted fixes.
5. Complete: performance-route tests cover URL validation, device validation, and normalized error payload.

---

## Final Assessment

The architecture and hardening direction are strong, and the recent performance-route consistency regression has been addressed. Remaining risk is focused on frontend test stability and tightening `sourceDir` policy semantics.
