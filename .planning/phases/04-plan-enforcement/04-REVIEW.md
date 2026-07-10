---
phase: 04-plan-enforcement
reviewed: 2026-07-10T18:00:25Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - app/[locale]/(app)/layout.tsx
  - app/[locale]/(app)/notes/page.tsx
  - components/UpgradeModal.tsx
  - convex/helpers/helper.ts
  - convex/notes.test.ts
  - convex/notes.ts
  - hooks/useNoteMutations.ts
  - messages/en.json
  - messages/fr.json
  - providers/UpgradeModalProvider.tsx
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-10T18:00:25Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the Free-tier 20-note cap enforcement in `convex/notes.ts` and the
shared upgrade-modal wiring across `app/[locale]/(app)/notes/page.tsx`,
`hooks/useNoteMutations.ts`, `providers/UpgradeModalProvider.tsx`, and
`components/UpgradeModal.tsx`.

The specific gap-closure pattern called out in the review brief — throwing
`ConvexError("NOTE_LIMIT_REACHED")` (not a bare `Error`) on the server, and
checking `err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED"` on
both client call sites — **is applied correctly and consistently**. Both
`hooks/useNoteMutations.ts:82` and `app/[locale]/(app)/notes/page.tsx:673` use
the identical guard, and both are nested under the single
`UpgradeModalProvider` instance mounted in `app/[locale]/(app)/layout.tsx`, so
the modal is a true singleton shared by both call sites. Translation keys in
`messages/en.json` / `messages/fr.json` are complete and parallel for the
`PlanEnforcement` namespace.

However, tracing every code path in `convex/notes.ts` that inserts a `notes`
document reveals that the cap is enforced in exactly one of the two places
that can create new notes: `createNote`. The `duplicateNote` mutation — which
recursively clones a note and its entire subtree — performs no plan check at
all, and is reachable from the same UI (the "Duplicate" action in
`app/[locale]/(app)/notes/page.tsx`'s dropdown/context menus) with no gating
on remaining quota. This is a complete bypass of the feature under review and
is filed as a Critical finding. Two test-quality/consistency warnings are
also raised.

## Critical Issues

### CR-01: `duplicateNote` bypasses the Free-tier 20-note cap entirely

**File:** `convex/notes.ts:718-817` (contrast with the guarded path at `convex/notes.ts:542-561`)
**Issue:**
`createNote` is the only mutation that calls `isProUser` / checks
`FREE_NOTE_LIMIT`. `duplicateNote` inserts a new note via
`ctx.db.insert("notes", ...)` at line 747 inside `duplicateRecursive`, with no
plan/quota check anywhere in the handler. Since `duplicateRecursive` clones
every descendant of the source note, a single "Duplicate" click on a note
with N descendants inserts N+1 new notes — with zero gating regardless of the
caller's plan or existing note count.

A Free user who is already at the 20-note cap (where `createNote` correctly
throws `NOTE_LIMIT_REACHED`) can still open the "Duplicate" action on any
note they have edit access to (`app/[locale]/(app)/notes/page.tsx:253-260,
334-340`) and add unbounded additional notes. This directly contradicts the
comment at `convex/notes.ts:542-544` ("Free-tier 20-note cap … cannot be
bypassed by the client — ROADMAP SC1") — the cap _can_ be bypassed by the
client, via a different, unguarded mutation that performs the same kind of
insert. This is a server-side authorization/business-logic gap, not merely a
missed UI affordance, since `duplicateNote` is a public mutation and could be
invoked directly regardless of what the UI exposes.

**Fix:** Add the same guard used in `createNote` to `duplicateNote`, sized to
the number of notes about to be inserted (source note + descendants), e.g.:

```ts
export const duplicateNote = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const sourceNote = await ctx.db.get(args.id);
    if (!sourceNote) {
      throw new Error("Note not found");
    }
    await requireEditAccess(ctx, args.id, user._id);
    if (sourceNote.parentNote) {
      await requireEditAccess(ctx, sourceNote.parentNote, user._id);
    }

    // Count how many notes this duplication would add (source + all
    // descendants), then apply the same Free-tier cap used by createNote.
    const countDescendantsToClone = async (
      noteId: Id<"notes">,
    ): Promise<number> => {
      const children = await ctx.db
        .query("notes")
        .withIndex("by_parent", q => q.eq("parentNote", noteId))
        .collect();
      let total = children.length;
      for (const child of children) {
        total += await countDescendantsToClone(child._id);
      }
      return total;
    };

    const pro = await isProUser(ctx);
    if (!pro) {
      const notesToAdd = 1 + (await countDescendantsToClone(args.id));
      const ownedNotes = await ctx.db
        .query("notes")
        .withIndex("by_owner", q => q.eq("owner", user._id))
        .collect();
      if (ownedNotes.length + notesToAdd > FREE_NOTE_LIMIT) {
        throw new ConvexError("NOTE_LIMIT_REACHED");
      }
    }

    // ... existing duplicateRecursive logic unchanged
  },
});
```

Note this can no longer use `.take(FREE_NOTE_LIMIT + 1)` as a bound the way
`createNote` does, since the number of notes being _added_ isn't 1 — the
exact owned count is needed to compare against `notesToAdd`. Also wire the
same `ConvexError("NOTE_LIMIT_REACHED")` → `upgradeModal.open()` handling
into the `duplicateNote` mutation call sites (`app/[locale]/(app)/notes/page.tsx:497-499`
and `providers/TreeProvider.tsx:127-129`), which currently have no `onError`
handler at all.

## Warnings

### WR-01: Regression test doesn't actually verify the `ConvexError` fix it documents

**File:** `convex/notes.test.ts:42-50, 71-79, 143-151, 167-174`
**Issue:** Every rejection test uses
`await expect(...).rejects.toThrow("NOTE_LIMIT_REACHED")`. `toThrow` only
matches on the error's `message` substring — it passes identically whether
the handler throws `new ConvexError("NOTE_LIMIT_REACHED")` or a bare
`new Error("NOTE_LIMIT_REACHED")`. Since the entire point of the gap-closure
fix (per this phase's context) was that a bare `Error`'s message gets
redacted crossing the real client/server boundary while `ConvexError.data`
does not, this test suite provides no regression protection against someone
reintroducing the bare-`Error` bug — it would still pass. `convexTest`
executes the mutation handler in-process, so `err` here is the literal object
thrown by the handler, and the stronger assertion is available.

**Fix:**

```ts
await expect(
  t
    .withIdentity({ tokenIdentifier: "...", subject: "..." })
    .mutation(api.notes.createNote, { title: "n21" }),
).rejects.toThrow(); // keep as a sanity check, then also assert shape:

try {
  await t
    .withIdentity({ tokenIdentifier: "...", subject: "..." })
    .mutation(api.notes.createNote, { title: "n21" });
  expect.unreachable();
} catch (err) {
  expect(err).toBeInstanceOf(ConvexError);
  expect((err as ConvexError<string>).data).toBe("NOTE_LIMIT_REACHED");
}
```

Apply the same strengthening to all four rejection tests (SC1, SC3, past_due,
canceled).

### WR-02: `getUser` uses `.filter()` instead of the existing `by_token` index

**File:** `convex/helpers/helper.ts:11-14`
**Issue:**

```ts
const user = await ctx.db
  .query("users")
  .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
  .first();
```

`convex/_generated/ai/guidelines.md:244` explicitly states: "Do NOT use
`filter` in queries. Instead, define an index in the schema and use
`withIndex` instead." A `by_token` index already exists on `users`
(`convex/schema.ts:19`) and is used correctly elsewhere
(`convex/users.ts:20`), so this isn't a missing-index gap — it's an
inconsistent use of the already-defined index. `getUser` is called by nearly
every query and mutation in `notes.ts` (including the new `createNote`
plan-enforcement path), so every request pays for a full table scan on
`users` here.
**Fix:**

```ts
const user = await ctx.db
  .query("users")
  .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
  .first();
```

### WR-03: `createNote`'s `onError` handlers silently swallow all non-quota errors

**File:** `app/[locale]/(app)/notes/page.tsx:665-676`, `hooks/useNoteMutations.ts:78-85`
**Issue:** Both `onError` callbacks only special-case
`NOTE_LIMIT_REACHED` (opening the upgrade modal); any other failure (network
error, auth failure, validation error thrown server-side, etc.) rolls back
the optimistic cache update via `context.previousTrees`/`previousTree` and
then does nothing else — no toast, no inline message, no rethrow. The user's
"Create" dialog has already been closed and the form reset in `onMutate`
(page.tsx:649-651), so on any non-quota failure the optimistic note simply
vanishes with no visible explanation of what happened.
**Fix:** Add a fallback branch (e.g. a toast) for the `else` case:

```ts
if (err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED") {
  upgradeModal.open();
} else {
  toast.error(t("createError")); // or equivalent user-facing feedback
}
```

## Info

### IN-01: `isProUser` re-derives identity that `getUser` already fetched

**File:** `convex/notes.ts:547`, `convex/helpers/helper.ts:27-41`
**Issue:** `createNote` calls `getUser(ctx)` (which internally calls
`ctx.auth.getUserIdentity()`) and then separately calls `isProUser(ctx)`
(which calls `ctx.auth.getUserIdentity()` again). Not a correctness bug —
Convex identity is stable within a single request — but it's a redundant
auth round-trip and a slightly awkward API shape (both helpers independently
re-derive the same identity instead of one being able to take the other's
result).
**Fix:** Consider an overload of `isProUser` that accepts an already-resolved
`identity`/`clerkUserId` so callers that already have it (like `createNote`,
which just called `getUser`) can skip the second `getUserIdentity()` call.

---

## Orchestrator Disposition

- **CR-01 (`duplicateNote` bypass):** Not a gap — explicitly evaluated and deferred during discuss-phase. `04-CONTEXT.md` D-02 states: "`duplicateNote` is NOT gated in this phase — a Free user duplicating a note with children could exceed 20 as a known, accepted minor loophole... Do not add duplicate-note capping; it's explicitly deferred." The `<deferred>` section confirms it is intentionally out of scope, not planned for a future phase unless it becomes a real problem. The plan-checker independently confirmed this exclusion during planning. No action taken.
- **WR-01 (weak test assertion):** Fixed — `convex/notes.test.ts` now asserts `instanceof ConvexError` and `.data === "NOTE_LIMIT_REACHED"` on all four rejection tests (commit `14e6534`).
- **WR-02 (`getUser` uses `.filter()` not `by_token` index):** Valid finding but pre-existing code outside this phase's scope (`getUser` was not introduced or substantively modified by Phase 4 — only a new `isProUser` export was added alongside it). Left as-is to avoid scope creep; worth a follow-up cleanup phase or todo.
- **WR-03 (`onError` swallows non-quota errors):** Valid observation but explicitly out of scope per `04-CONTEXT.md`: this phase's job was only to add the upgrade-modal trigger for the limit case (D-06/D-07); general error-surfacing UX was never in scope and both call sites already had this silent-revert behavior before this phase. Left as-is.
- **IN-01 (redundant identity fetch):** Minor, no action taken — correctness is unaffected.

---

_Reviewed: 2026-07-10T18:00:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
