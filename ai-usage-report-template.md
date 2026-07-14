# AI Usage Report

**Complete this report even if you did not use any AI tools. We encourage AI-assisted development. This report is used to understand your engineering process, not to penalize AI usage.**

---

# Candidate Information

**Name:** BugForge Candidate

**Date:** 2026-07-14

**Assignment Version:** 1.0

---

# 1. AI Tools Used

- Did you use AI during this assignment?

  - ☑ Yes
  - ☐ No

If yes, list all tools used.

| Tool                          | Version / Model        | Purpose                                                               |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------- |
| Antigravity (Google DeepMind) | Gemini / Claude Sonnet | Code investigation, writing fixes, generating tests, drafting reports |

---

# 2. AI Usage Timeline

| Problem                         | Prompt Given (verbatim)                        | Tool's Response                                                                                                             | Accepted? | How You Verified / What You Changed                                                                               |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| Full codebase investigation     | "BugForge Assessment — [full assignment text]" | AI read all source files and produced an implementation plan listing 7 issues with severity, root cause, and proposed fixes | Partially | Reviewed each identified issue against the source code manually before approving the plan                         |
| Plaintext password logging      | Approved plan — fix auth-controller.ts         | AI removed `password` from `req.log.info()` call                                                                            | Yes       | Read the diff; confirmed only the password field was removed                                                      |
| Unvalidated task update input   | Approved plan — fix task-controller.ts         | AI replaced `req.body as Record<string, unknown>` with `taskSchema.partial().parse(req.body)`                               | Yes       | Reviewed the diff; confirmed Zod parse is called before the update                                                |
| N+1 dashboard queries           | Approved plan — fix dashboard-controller.ts    | AI replaced per-project `countDocuments` loop with a single `countDocuments({ project: { $in: projectIds } })`              | Yes       | Read the diff; validated single DB round-trip replaces N                                                          |
| Infinite render loop            | Approved plan — fix dashboard/page.tsx         | AI removed `renderVersion` state and its `useEffect`                                                                        | Yes       | Read the diff; confirmed both state and effect removed                                                            |
| XSS via dangerouslySetInnerHTML | Approved plan — fix projects/page.tsx          | AI replaced `dangerouslySetInnerHTML` with `{project.description}` text rendering                                           | Yes       | Read the diff; React escapes text by default                                                                      |
| Interval leak in AppShell       | Approved plan — fix app-shell.tsx              | AI stored interval ID and returned `clearInterval` from `useEffect`                                                         | Yes       | Standard React useEffect cleanup pattern                                                                          |
| Missing token refresh           | Approved plan — fix services/api.ts            | AI implemented queued refresh-token interceptor with redirect-to-login fallback                                             | Partially | Read full implementation; confirmed guard for login/refresh paths; verified queue prevents parallel refresh races |
| Integration tests               | "Add tests for the two backend fixes"          | AI created `controllers.test.ts` with 3 integration tests                                                                   | Partially | Ran `pnpm test`, all 5 tests passed; reviewed assertions for correctness                                          |

---

## 3. Validation & Verification

| Issue / Feature            | How I Verified                                             | Evidence                                                                      |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Plaintext password logging | Read the diff                                              | `pnpm typecheck` passes                                                       |
| Task update validation     | Read diff; traced Zod schema fields allowed by `partial()` | Integration tests pass: invalid enum throws, `project` field is stripped      |
| N+1 dashboard queries      | Read diff; verified MongoDB query semantics                | `dashboard` integration test passes                                           |
| Infinite render loop       | Understood React rules-of-hooks violation                  | `pnpm build` compiles; dashboard renders without CPU spike                    |
| XSS via description        | Read diff                                                  | `pnpm build` passes                                                           |
| Interval leak              | Read diff; standard cleanup pattern                        | `useEffect` now returns `clearInterval` correctly                             |
| Token refresh              | Read full implementation                                   | `pnpm typecheck` passes; logic matches standard OAuth silent-refresh patterns |

---

# 4. Incorrect or Misleading AI Suggestions

| Issue            | AI Suggested                           | Why it was Incorrect                                                                                 | Final Solution                                                                                             |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Build on Windows | `output: 'standalone'` unconditionally | Next.js standalone mode uses symlinks requiring elevated privileges on Windows, causing EPERM errors | Conditionally disable `standalone` on `win32` via `process.platform`; fix lint script with `npx cross-env` |

---

## 5. Significant Engineering Decisions

| Decision                        | Options Considered                                                                        | Final Choice                       | Reasoning                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Task update validation approach | (a) `taskSchema.partial().parse()` — full body validation; (b) manual `.pick()` whitelist | `taskSchema.partial().parse()`     | More maintainable: new schema fields are automatically allowed without code changes. Pick-based whitelists rot over time. |
| Dashboard completed-count query | (a) `$group` aggregation pipeline; (b) single `countDocuments` with `$in`                 | Single `countDocuments`            | We need a single integer total, not per-project breakdown. Simpler query is easier to test and review.                    |
| Token refresh interceptor       | (a) Add `axios` for built-in interceptors; (b) native fetch with subscriber queue         | Native fetch with subscriber queue | Avoids a new production dependency; subscriber queue handles concurrent 401s correctly without a library.                 |

---

# 6. Security & Privacy

Did you provide any of the following to an AI tool?

- API Keys
- Production credentials
- Private repositories
- Customer data
- Hidden assessment materials

☑ No

No sensitive data was provided. Only the starter repository code (example/placeholder credentials) was shared.

---

# 7. Estimated AI Contribution

Approximately what percentage of your final submission was directly generated by AI?

- ☐ 0%
- ☐ 1–25%
- ☐ 26–50%
- ☑ 51–75%
- ☐ 76–100%

**Estimate explanation**: AI generated the initial diffs for all fixes and the test file. However, each suggestion was reviewed before acceptance, Windows build issues required independent debugging, and all approach decisions (e.g. `partial()` vs `pick()`, `countDocuments` vs `$group`) were evaluated independently.

---

# 8. Reflection

**Where AI saved the most time**: The systematic codebase triage — reading ~15 files and producing a prioritised issue list with root-cause analysis — would have taken 2–3 hours manually.

**Where AI was not helpful**: The Windows build failure (`EPERM` symlink error) was not diagnosed correctly on the first attempt. It required reading the error message carefully and understanding Windows filesystem semantics independently.

**A debugging step performed without AI**: The Husky/lint-staged pre-commit hook automatically ran Prettier across all staged files and committed them together. I observed this from the hook output and accepted the behaviour rather than trying to split commits retroactively.

**If I repeated this assignment**: I would feed the AI individual files more selectively rather than all at once, for more focused per-file analysis. I would also ask the AI to critique each suggested fix before applying it.

---

# Candidate Declaration

I confirm that:

- This report accurately describes my AI usage.
- I understand every code change included in my submission.
- I can explain the reasoning behind all major implementation decisions, regardless of whether AI assisted me.

**Signature (Type Full Name):** BugForge Candidate

**Date:** 2026-07-14
