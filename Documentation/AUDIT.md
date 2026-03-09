# Kaleidoscope Codebase Audit (Independent)

**Date:** 2026-03-09  
**Scope:** `c:\Code\kaleidoscope` monorepo  
**Auditor:** GitHub Copilot (GPT-5.3-Codex)

---

## Executive Summary

Kaleidoscope is a well-structured monorepo with strong product direction: responsive previews, screenshot capture, auth-aware proxying, crawl support, and MCP tooling are thoughtfully integrated.

The software is solid for local/dev usage, but there are still important hardening and consistency gaps before broader or production-style deployment.

**Overall health:** Good foundation, medium operational risk if internet-exposed without additional controls.

---

## What Was Re-Audited

This report is a fresh audit of current source files, including:

- `server/index.ts`, `server/routes/*`, `server/services/*`
- `mosaic-client/src/components/*`, `mosaic-client/src/pages/*`, `mosaic-client/src/hooks/*`
- `mcp-server/src/process-manager.ts`, `mcp-server/src/tools/*`

---

## Findings (Ordered by Severity)

### Critical

#### C1. Production CORS can fall back to wildcard
**Location:** `server/index.ts`  
**Evidence:** Production origin uses `process.env.CORS_ORIGIN || '*'`.  
**Risk:** If env config is incomplete, API can be called by any origin.  
**Recommendation:** Fail closed in production when `CORS_ORIGIN` is missing or invalid.

#### C2. URL-based features have partial SSRF protection
**Location:** `server/routes/proxy.routes.ts`, `server/routes/screenshot.routes.ts`, `server/routes/crawl.routes.ts`  
**Evidence:** Basic scheme + metadata host blocking exists, but no complete private/loopback range handling or DNS rebinding mitigation.  
**Risk:** Internal network access in non-local deployments.  
**Recommendation:** Block private/loopback/link-local IPv4/IPv6, resolve DNS before allow, and reject private resolutions.

#### C3. Device definition drift risk across multiple layers
**Location:**
- `mosaic-client/src/lib/devices.ts`
- `server/services/screenshot.service.ts`
- `server/routes/screenshot.routes.ts`
- `mcp-server/src/tools/preview.ts`
- `mosaic-client/src/components/screenshot-panel.tsx`

**Risk:** Device updates require multiple edits; mismatches can cause silent behavior divergence.  
**Recommendation:** Move to one shared source (`shared/devices.ts`) and import everywhere.

### High

#### H1. Device IDs are not strictly validated end-to-end
**Location:** `mcp-server/src/tools/preview.ts`, `server/routes/screenshot.routes.ts`  
**Evidence:** MCP tool accepts arbitrary strings; screenshot route validates array shape but not canonical IDs before service capture.  
**Risk:** Silent partial results and hard-to-debug UX.  
**Recommendation:** Add strict runtime validation against canonical device IDs with explicit 400 errors.

#### H2. Request hardening controls are missing
**Location:** `server/index.ts`  
**Evidence:** Default `express.json()` / `express.urlencoded()` with no explicit size limits; no rate limiting middleware.  
**Risk:** Resource abuse and avoidable DoS exposure.  
**Recommendation:** Add request size limits, rate limiting, and per-endpoint caps.

#### H3. Cookie payloads are accepted with minimal constraints
**Location:** `server/routes/proxy.routes.ts`, `server/services/proxy.service.ts`  
**Evidence:** Cookie objects are accepted and forwarded as headers with minimal input constraints.  
**Risk:** Header abuse edge cases and oversized payload behavior.  
**Recommendation:** Validate cookie name/value format, maximum count, and maximum size.

#### H4. MCP startup failures can be opaque
**Location:** `mcp-server/src/process-manager.ts`  
**Evidence:** Spawn failures often surface as wait timeout only; limited structured diagnostics returned by tools.  
**Risk:** Longer troubleshooting cycles during setup failures.  
**Recommendation:** Capture startup stderr/exit reason and return concise actionable diagnostics in tool responses.

### Medium

#### M1. Render-phase state updates in DeviceFrame
**Location:** `mosaic-client/src/components/device-frame.tsx`  
**Evidence:** Component updates state inside render branch using ref comparisons.  
**Risk:** Fragile render timing under concurrent React behavior.  
**Recommendation:** Move transition logic to `useEffect` with explicit dependencies.

#### M2. Prop drilling concentration in Home page
**Location:** `mosaic-client/src/pages/home.tsx`  
**Evidence:** Home coordinates many cross-cutting states passed into Sidebar/PreviewArea.  
**Risk:** Refactor friction and accidental coupling over time.  
**Recommendation:** Extract shared preview state into a central store with clear domain slices.

#### M3. Polling strategy can be more selective
**Location:** `mosaic-client/src/hooks/use-tunnel.tsx`  
**Evidence:** Periodic refetch runs regardless of whether a tunnel is active.  
**Risk:** Unnecessary network churn and rendering overhead.  
**Recommendation:** Enable polling only while tunnel is active or while status is transitional.

#### M4. Proxy HTML rewriting remains basic
**Location:** `server/services/proxy.service.ts`  
**Evidence:** Current strategy injects a `<base>` tag, but does not provide robust element-level rewriting.  
**Risk:** Navigation/resource behavior inconsistencies on complex pages.  
**Recommendation:** Add structured HTML rewriting where required and expand tests for tricky cases.

---

## Strengths

1. **Clear architecture boundaries:** server/client/MCP responsibilities are generally clean.
2. **Good lifecycle management:** graceful shutdown and service cleanup patterns are present.
3. **Practical feature set:** auth proxy + mock injection + screenshots + crawl is a strong differentiator.
4. **Reasonable test baseline:** broad behavior coverage already exists across frontend workflows.
5. **Developer ergonomics:** local startup workflow is straightforward and Docker support is present.

---

## Prioritized Improvement Roadmap

### Phase 1 (Security + Consistency)
1. Fail-closed production CORS behavior.
2. Add request body size limits and rate limiting.
3. Expand SSRF protections to private/loopback/DNS-rebind checks.
4. Centralize device definitions to one shared module.
5. Enforce strict device ID validation in server and MCP.

### Phase 2 (Reliability)
1. Improve MCP process startup diagnostics.
2. Add stricter cookie validation and payload bounds.
3. Refactor render-phase state transitions in `device-frame.tsx`.
4. Tighten async cancellation/timeout behavior in network-heavy UI actions.

### Phase 3 (Maintainability + Ops)
1. Reduce prop drilling by extracting shared preview state.
2. Add structured logs with request IDs.
3. Expand tests for SSRF edge cases, invalid-device paths, and MCP startup failures.

---

## Suggested Acceptance Criteria for Next Audit Cycle

1. No production wildcard CORS fallback.
2. SSRF test suite covers private IPv4/IPv6 + DNS rebinding scenarios.
3. Single canonical device list consumed by all layers.
4. Invalid device IDs rejected consistently with explicit errors.
5. MCP startup failure messages include root cause class (spawn/port/dependency/timeout).

---

## Final Assessment

Kaleidoscope is already a capable and thoughtfully engineered local developer tool. The next step is not feature breadth but **hardening and consistency**: secure defaults, validation rigor, and single-source contracts. Once those are addressed, it should scale much more confidently to team-level and hosted environments.
