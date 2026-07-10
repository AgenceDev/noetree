# Phase 4: Plan Enforcement - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 8 (2 modified-in-place backend, 3 modified-in-place frontend, 1 read-only reference, 2 new files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File                                                                                                                                         | Role             | Data Flow                                   | Closest Analog                                                                                                                     | Match Quality                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `convex/notes.ts` (`createNote`, ~line 522)                                                                                                               | mutation         | CRUD (gated write)                          | same file: `updateNote` (553), `getTreesByMe` (262) for count query                                                                | exact (same file, same conventions)                                                    |
| `convex/helpers/helper.ts` (new `isProUser`/`getPlanStatus`)                                                                                              | utility/helper   | request-response (identity-derived lookup)  | same file: `getUser(ctx)` (4-21); `convex/subscriptions.ts` `getSubscription` (4-19)                                               | exact                                                                                  |
| `hooks/useNoteMutations.ts` (`createNote` mutation, 52-85)                                                                                                | hook             | request-response / optimistic-update        | same file: other mutations' `onError` (updateNoteTitle 45-49, deleteNote 104-108)                                                  | exact                                                                                  |
| `providers/TreeProvider.tsx` (`onAddChildNote`, 261-284)                                                                                                  | provider/context | event-driven (calls `createNote` from hook) | same file: other context-value callbacks                                                                                           | exact — **see note below, this is the real child-note call site, not `NotesTree.tsx`** |
| `app/[locale]/(app)/notes/page.tsx` (root `createNote` mutation + "New note" Dialog, 637-770)                                                             | component (page) | request-response / optimistic-update        | same file: `updateNoteTitle`/`deleteNote` mutations (458-530) for onError shape; `ShareDialog.tsx` for standalone-dialog structure | exact                                                                                  |
| `components/NotesTree.tsx` (`onAddChildNote` prop call, line 452)                                                                                         | component        | event-driven (prop passthrough)             | N/A — no mutation logic lives here                                                                                                 | role-match only; see note below                                                        |
| `providers/UpgradeModalProvider.tsx` (**new file** — global trigger for the modal, needed so both `page.tsx` and `TreeProvider.tsx` subtrees can open it) | provider         | event-driven (open/close signal)            | `providers/HeaderProvider.tsx` (full file)                                                                                         | exact                                                                                  |
| `components/UpgradeModal.tsx` (**new file** — the Dialog itself, D-06/D-08)                                                                               | component        | request-response (static content + Link)    | `components/ShareDialog.tsx` (1-79) for standalone-Dialog-component shape; `components/ui/dialog.tsx` for primitives               | exact                                                                                  |
| `app/[locale]/(app)/layout.tsx` (mount new provider)                                                                                                      | config/layout    | N/A                                         | same file (mounting `HeaderProvider`)                                                                                              | exact                                                                                  |
| `convex/schema.ts` (`notes.by_owner`, `subscriptions.by_clerkUserId`)                                                                                     | model            | N/A                                         | read-only reference — not modified                                                                                                 | n/a                                                                                    |

**Important correction to CONTEXT.md's file list:** `components/NotesTree.tsx` does **not** call `api.notes.createNote` itself. It only invokes the `onAddChildNote` prop (line 452: `onAddChildNote(note._id, title, getCurrentContent)`). The actual mutation call for child-note creation is wired in `providers/TreeProvider.tsx` lines 261-284 (`onAddChildNote` in the context value, which calls `createNote(...)` — the `createNote` destructured from `useNoteMutations(noteId, setSelectedNoteId)` at line 131-137). So the two real onError wiring sites for D-07 are:

1. `hooks/useNoteMutations.ts` (lines 75-79, the `onError` for its internal `createNote` mutation) — used by `TreeProvider.tsx`.
2. `app/[locale]/(app)/notes/page.tsx` (lines 662-670, the `onError` for its own separately-defined `createNote` mutation).

`NotesTree.tsx` itself needs no changes unless the planner chooses to propagate a loading/error prop through it — it is not a mutation call site.

---

## Pattern Assignments

### `convex/notes.ts` — `createNote` (mutation, CRUD gated write)

**Analog:** same file, `getTreesByMe` (lines 262-281) for the `by_owner` index query shape; `updateNote`/`createNote` itself for the error-throw convention.

**Imports already present** (lines 1-4):

```typescript
import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getUser } from "./helpers/helper";
import { Doc, Id } from "./_generated/dataModel";
```

Add the new helper to this import line, e.g. `import { getUser, isProUser } from "./helpers/helper";`.

**Existing `createNote` handler** (lines 522-551) — this is the exact function to modify:

```typescript
export const createNote = mutation({
  args: {
    title: v.string(),
    content: v.optional(v.any()),
    parentNote: v.optional(v.id("notes")),
    childNotes: v.optional(v.array(v.id("notes"))),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);

    if (!user) {
      throw new Error("User not found");
    }

    if (args.parentNote) {
      await requireEditAccess(ctx, args.parentNote, user._id);
    }

    const note = await ctx.db.insert("notes", {
      owner: user._id,
      title: args.title,
      content: args.content || "{}",
      parentNote: args.parentNote,
      childNotes: args.childNotes || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return note;
  },
});
```

The limit check must be inserted after `getUser`/before `ctx.db.insert`, gated by the new Pro-status helper.

**Count-query pattern to copy** (`getTreesByMe`, lines 276-281 — index shape only, adapt the `.eq` clause per D-01 to NOT filter `parentNote`):

```typescript
const ownedRootNotes = await ctx.db
  .query("notes")
  .withIndex("by_owner", q =>
    q.eq("owner", user._id).eq("parentNote", undefined),
  )
  .collect();
```

For D-01 (count **all** notes regardless of depth), drop the `.eq("parentNote", ...)` clause so the index scan is by `owner` alone: `.withIndex("by_owner", q => q.eq("owner", user._id))`. Per `convex/_generated/ai/guidelines.md` ("never use `.collect().length` to count rows" / "always bound `.collect()` with `.take()`"), prefer `.take(FREE_NOTE_LIMIT + 1)` and check `result.length > FREE_NOTE_LIMIT` rather than an unbounded `.collect()` — this keeps the check O(21) instead of O(all notes) and satisfies both the guideline and D-01's literal 21st-note rejection requirement.

**Bare-throw error convention** (established throughout this file, e.g. lines 533, 100, 272):

```typescript
throw new Error("User not found");
// ...
throw new Error("Unauthorized: Edit access required");
```

The new limit error should follow this convention with a **distinguishable message** so the client `onError` handlers (D-07) can detect it, e.g.:

```typescript
throw new Error("NOTE_LIMIT_REACHED");
```

No existing file uses `ConvexError` in a mutation (only `convex/stripeWebhooks.ts` uses it for webhook signature failures) — stick with the bare `Error` + distinguishable message string, matching the rest of `notes.ts`, rather than introducing `ConvexError` as a new pattern in this file.

---

### `convex/helpers/helper.ts` — new `isProUser`/`getPlanStatus` helper

**Analog A — same file, `getUser`** (lines 1-21, full file):

```typescript
import { GenericQueryCtx } from "convex/server";
import { DataModel } from "../_generated/dataModel";

export const getUser = async (ctx: GenericQueryCtx<DataModel>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    console.error("User not authenticated");
    return null;
  }

  const user = await ctx.db
    .query("users")
    .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
    .first();

  if (!user) {
    console.error("User not found");
    return null;
  }
  return user;
};
```

Note: `getUser` takes `GenericQueryCtx<DataModel>`, which is compatible with both `QueryCtx` and `MutationCtx` (mutation ctx is a superset) — the new helper should use the same signature so it's callable from `createNote` (a mutation).

**Analog B — `convex/subscriptions.ts` `getSubscription`** (lines 4-19), the exact identity-derivation + index-lookup pattern D-05 requires be mirrored (not called directly, since it's a `query` and `createNote` is a `mutation`):

```typescript
export const getSubscription = query({
  args: {},
  handler: async ctx => {
    // Security: clerkUserId is derived exclusively from the caller's
    // authenticated Convex identity (never a client-supplied argument) so a
    // signed-in user cannot read another user's subscription/billing status
    // by passing an arbitrary id (IDOR — found in 03-REVIEW.md CR-01).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});
```

**Composed pattern for the new helper** (combining both analogs — pseudocode for planner, exact shape to implement in `convex/helpers/helper.ts`):

```typescript
import { GenericQueryCtx } from "convex/server";
import { DataModel } from "../_generated/dataModel";

export const isProUser = async (ctx: GenericQueryCtx<DataModel>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
    .unique();

  return subscription?.status === "active";
};
```

This satisfies D-03 (only `"active"` counts as Pro) and D-04 (no row → falls through to `false`/Free) as the natural result of optional chaining against `.unique()`'s `null` return, with no extra branch needed. Uses `identity.subject` (bare `clerkUserId`, matching `subscriptions.by_clerkUserId`), matching D-05's mandate to reuse the same identity-derived lookup — **do not** use `identity.tokenIdentifier` here, that's the separate format used only for the `users` table (see `01-CONTEXT.md` D-01/D-02, referenced in canonical_refs).

---

### `hooks/useNoteMutations.ts` — `createNote` mutation `onError` (lines 52-85)

**Analog:** same file, existing `onError` shape used by every mutation in this hook (e.g. `updateNoteTitle`, lines 45-49; `deleteNote`, lines 104-108).

**Current `createNote` mutation** (lines 52-85 — the exact block to extend):

```typescript
const createNoteMutate = useConvexMutation(api.notes.createNote);
const createNote = useMutation<
  Id<"notes">,
  Error,
  Parameters<typeof createNoteMutate>[0],
  { previousTree: NoteTree | undefined }
>({
  mutationFn: createNoteMutate,
  onMutate: async variables => {
    await queryClient.cancelQueries({ queryKey });
    const previousTree = queryClient.getQueryData<NoteTree>(queryKey);
    const tempId = `temp-${Math.random()}`;
    if (previousTree && variables.parentNote) {
      const newTree = addChildNoteToTree(
        previousTree,
        variables.parentNote,
        variables.title,
        tempId,
      );
      queryClient.setQueryData(queryKey, newTree);
    }
    return { previousTree };
  },
  onError: (err, variables, context) => {
    if (context?.previousTree) {
      queryClient.setQueryData(queryKey, context.previousTree);
    }
  },
  onSuccess: (newNoteId: Id<"notes">) => {
    if (setSelectedNoteId) {
      setSelectedNoteId(newNoteId);
    }
  },
});
```

The `onError` currently only reverts optimistic state (line 75-79 in every mutation in this file — a hard-established convention: never surfaces the error to the user). This phase adds the FIRST user-facing error surfacing in this file: after reverting, detect `err.message === "NOTE_LIMIT_REACHED"` (or whatever exact string the `createNote` mutation throws) and call the new modal-trigger hook (`useUpgradeModal().open()` — see provider pattern below).

`useNoteMutations` does not currently accept a callback param for errors — since `TreeProvider.tsx` is the only caller of this hook (line 137: `useNoteMutations(noteId, setSelectedNoteId)`), the planner has two options: (a) call the new global `useUpgradeModal()` hook directly inside `useNoteMutations.ts`'s `onError`, or (b) add an `onLimitReached` callback param to `useNoteMutations(noteId, setSelectedNoteId, onLimitReached)`. Given D-07's "both call sites" requirement and the mismatch between `NotesTree.tsx`/`TreeProvider.tsx` and `page.tsx` being in separate component subtrees, option (a) — a shared context hook callable from anywhere — is simpler and matches the `HeaderProvider`-style global-context pattern already used in this codebase (see below).

---

### `app/[locale]/(app)/notes/page.tsx` — root `createNote` mutation `onError` (lines 637-671) + "New note" Dialog (lines 703-770)

**Analog:** same file's sibling mutations for `onError` shape (`updateNoteTitle` 458-492, `deleteNote` 498-530); `ShareDialog.tsx` for the standalone-Dialog-component pattern if the modal needs to be a separate mountable component (it does, per D-06/D-07).

**Current `createNote` mutation** (lines 637-671 — the exact block to extend):

```typescript
const createNoteMutate = useConvexMutation(api.notes.createNote);
const { mutate: createNote, isPending: isNotePending } = useMutation<
  unknown,
  Error,
  Parameters<typeof createNoteMutate>[0],
  { previousTrees: DashboardTreeItem[] | undefined }
>({
  mutationFn: createNoteMutate,
  onMutate: async variables => {
    newTreeForm.reset();
    setNewTreeDialogOpen(false);
    setTitleError(null);

    await queryClient.cancelQueries({ queryKey });
    const previousTrees =
      queryClient.getQueryData<DashboardTreeItem[]>(queryKey);
    if (previousTrees) {
      const tempId = `temp-${Math.random()}` as unknown as Id<"notes">;
      queryClient.setQueryData(
        queryKey,
        addTreeToList(previousTrees, variables.title, tempId),
      );
    }
    return { previousTrees };
  },
  onError: (
    err,
    variables,
    context?: { previousTrees: DashboardTreeItem[] | undefined },
  ) => {
    if (context?.previousTrees) {
      queryClient.setQueryData(queryKey, context.previousTrees);
    }
  },
});
```

Same convention as `useNoteMutations.ts`: `onError` only reverts optimistic state today (lines 662-670). Add the same `err.message === "NOTE_LIMIT_REACHED"` check + `useUpgradeModal().open()` call here.

**Existing Dialog pattern to reuse the primitives from** (lines 703-770, the "New note" dialog — controlled `open`/`onOpenChange` state, `DialogTrigger asChild`, `DialogContent` > `DialogHeader`/`DialogTitle`/`DialogDescription` > body > `DialogFooter`):

```tsx
<Dialog open={newTreeDialogOpen} onOpenChange={setNewTreeDialogOpen}>
  <DialogTrigger asChild>
    <Button size="sm">
      <span className="hidden sm:inline">{t("createButton")}</span>
      <span className="sm:hidden text-lg font-bold">+</span>
    </Button>
  </DialogTrigger>
  <DialogContent>
    <Form {...newTreeForm}>
      <form onSubmit={handleSubmit} className="contents">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDesc")}</DialogDescription>
        </DialogHeader>
        {/* body */}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("close")}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isNotePending}>
            {t("create")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  </DialogContent>
</Dialog>
```

The new upgrade modal is **not** a form dialog (no submission, just a CTA linking out) — for its internal shape, `ShareDialog.tsx`'s controlled `open`/`onOpenChange` props pattern (below) is the closer analog than this form-dialog.

---

### `components/ShareDialog.tsx` — standalone controlled-Dialog component pattern (analog for the new `UpgradeModal.tsx`)

**Full pattern to copy** (lines 1-51 — imports, props shape, controlled open/close):

```tsx
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShareDialogProps {
  noteId: Id<"notes">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareDialog({
  noteId,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const t = useTranslations("ShareDialog");
  // ...local state...
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{/* ... */}</DialogTitle>
          <DialogDescription>{/* ... */}</DialogDescription>
        </DialogHeader>
        {/* body */}
      </DialogContent>
    </Dialog>
  );
}
```

For `UpgradeModal.tsx`, the `open`/`onOpenChange` props should instead come from the new `useUpgradeModal()` context hook (see below) rather than local component state — since the modal must be triggered from two unrelated component subtrees, not lifted state passed down as props from a single parent.

**CTA link pattern** — `app/[locale]/(app)/notes/page.tsx` line 34 already imports the locale-aware Link:

```tsx
import { Link } from "@/i18n/routing";
```

Use `<Link href="/pricing">{t("upgradeCta")}</Link>` inside a `DialogFooter`/`Button asChild` composition (matching the `DialogClose asChild` + `<Button>` composition already used at page.tsx lines 742-746) as the "Upgrade to Pro" CTA (D-06).

---

### `providers/HeaderProvider.tsx` — global context provider pattern (analog for the new `UpgradeModalProvider.tsx`)

**Full pattern to copy** (lines 1-67, adapted — this is the closest existing "global, cross-subtree triggerable UI state" pattern in the codebase):

```tsx
"use client";

import { createContext, ReactNode, useContext, useState, useMemo } from "react";

interface UpgradeModalContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [isOpen],
  );

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal open={isOpen} onOpenChange={setIsOpen} />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context) {
    throw new Error(
      "useUpgradeModal must be used within an UpgradeModalProvider",
    );
  }
  return context;
}
```

This mirrors `HeaderProvider`'s two-piece shape (context + `useX()` accessor hook that throws if used outside the provider, lines 61-67 / 90-95 of `HeaderProvider.tsx` and `TreeProvider.tsx` respectively) and gives both `hooks/useNoteMutations.ts` (used inside `TreeProvider`, itself nested under this new provider) and `app/[locale]/(app)/notes/page.tsx` a shared `useUpgradeModal().open()` call, satisfying D-07.

**Mounting pattern** — `app/[locale]/(app)/layout.tsx` (full file, 22 lines) shows exactly how a new provider is wrapped around existing children:

```tsx
import Header from "@/components/Header";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderProvider } from "@/providers/HeaderProvider";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <HeaderProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col h-screen overflow-hidden bg-background">
          <Header />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </HeaderProvider>
  );
}
```

Add `<UpgradeModalProvider>` as an additional outer (or inner, order doesn't matter since it doesn't depend on `HeaderProvider`) wrapper here so it's available to every route under `(app)`, including both `notes/page.tsx` and `notes/[id]/page.tsx` (which mounts `TreeProvider`).

---

## Shared Patterns

### Identity-derived resolution (never client-supplied)

**Source:** `convex/subscriptions.ts` lines 7-13 (comment + `ctx.auth.getUserIdentity()` call), reinforced by `convex/helpers/helper.ts` `getUser`
**Apply to:** the new `isProUser`/`getPlanStatus` helper and `createNote`'s limit check — never accept a `status`/`plan` argument from the client (per D-05 and the `03-REVIEW.md` CR-01 IDOR fix).

### Bare-throw error convention

**Source:** `convex/notes.ts` (all mutations, e.g. lines 533, 100, 272, 634)
**Apply to:** the new limit-exceeded throw in `createNote` — no try/catch wrapper, no `ConvexError`, just `throw new Error("<distinguishable message>")`.

### Optimistic-update + revert-only `onError`

**Source:** `hooks/useNoteMutations.ts` (every mutation, e.g. lines 45-49, 75-79, 104-108, 132-136, 162-166) and `app/[locale]/(app)/notes/page.tsx` (lines 483-491, 521-529, 562-570, 593-601, 662-670)
**Apply to:** both `createNote` `onError` handlers being extended — preserve the existing revert logic, add the modal-trigger check as an addition, not a replacement.

### Controlled Shadcn Dialog (`open`/`onOpenChange`)

**Source:** `components/ui/dialog.tsx` (primitives) + `components/ShareDialog.tsx` (standalone controlled component) + `app/[locale]/(app)/notes/page.tsx` lines 703-770 (inline controlled dialog)
**Apply to:** the new `UpgradeModal.tsx` — no new dialog library or pattern, D-06/D-08 mandate reuse.

### Global cross-subtree context + accessor hook

**Source:** `providers/HeaderProvider.tsx` (full file) — `createContext` + provider component + `useX()` hook that throws outside the provider
**Apply to:** the new `UpgradeModalProvider.tsx`/`useUpgradeModal()` — needed because the two `createNote` call sites (`page.tsx` and `TreeProvider.tsx`/`useNoteMutations.ts`) live in separate component subtrees with no shared parent state today.

## No Analog Found

None — all files/patterns needed for this phase have a close existing analog in the codebase.

## Metadata

**Analog search scope:** `convex/`, `hooks/`, `providers/`, `components/`, `app/[locale]/(app)/`
**Files scanned:** `convex/notes.ts`, `convex/subscriptions.ts`, `convex/helpers/helper.ts`, `convex/schema.ts`, `hooks/useNoteMutations.ts`, `providers/TreeProvider.tsx`, `providers/HeaderProvider.tsx`, `components/NotesTree.tsx`, `components/ShareDialog.tsx`, `components/ui/dialog.tsx`, `app/[locale]/(app)/notes/page.tsx`, `app/[locale]/(app)/layout.tsx`, `messages/en.json`
**Pattern extraction date:** 2026-07-10
