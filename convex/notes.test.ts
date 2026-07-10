import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Asserts the rejection is a ConvexError carrying NOTE_LIMIT_REACHED as its
// `.data` payload — not just a message-string match. A bare `Error` would
// also satisfy `.rejects.toThrow("NOTE_LIMIT_REACHED")`, which is exactly
// the redaction bug this phase's gap-closure fix corrected (a plain Error's
// message gets redacted crossing the real client/server boundary; only
// ConvexError.data survives it).
async function expectNoteLimitRejection(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow(ConvexError);
  try {
    await promise;
    expect.unreachable("expected promise to reject");
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    expect((err as ConvexError<string>).data).toBe("NOTE_LIMIT_REACHED");
  }
}

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.*s");

// Seeds a `roles` row + a `users` row (identified by `tokenIdentifier`) and
// `count` `notes` rows owned by that user. Returns the seeded user's _id.
async function seedUserWithNotes(
  t: ReturnType<typeof convexTest>,
  tokenIdentifier: string,
  count: number,
): Promise<Id<"users">> {
  return await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { role: "user" });
    const userId = await ctx.db.insert("users", {
      tokenIdentifier,
      role: roleId,
    });
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("notes", {
        owner: userId,
        title: `note-${i}`,
        content: "{}",
      });
    }
    return userId;
  });
}

describe("notes.createNote — Free-tier 20-note limit (NOTE_LIMIT_REACHED)", () => {
  test("SC1: a Free user who already owns 20 notes is rejected on the 21st createNote", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithNotes(t, "https://clerk.dev|user_free", 20);

    await expectNoteLimitRejection(
      t
        .withIdentity({
          tokenIdentifier: "https://clerk.dev|user_free",
          subject: "user_free",
        })
        .mutation(api.notes.createNote, { title: "n21" }),
    );
  });

  test("a Free user who owns 19 notes can create the 20th note", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithNotes(t, "https://clerk.dev|user_free19", 19);

    const noteId = await t
      .withIdentity({
        tokenIdentifier: "https://clerk.dev|user_free19",
        subject: "user_free19",
      })
      .mutation(api.notes.createNote, { title: "n20" });

    expect(noteId).toBeTruthy();
  });

  test("SC3: a user with NO subscriptions row is treated as Free — 21st note is rejected", async () => {
    const t = convexTest(schema, modules);
    // No subscriptions row is seeded at all for this user.
    await seedUserWithNotes(t, "https://clerk.dev|user_norow", 20);

    await expectNoteLimitRejection(
      t
        .withIdentity({
          tokenIdentifier: "https://clerk.dev|user_norow",
          subject: "user_norow",
        })
        .mutation(api.notes.createNote, { title: "n21" }),
    );
  });

  test("SC2: a Pro user (active subscription) creates note 21 and note 50 with no rejection", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithNotes(t, "https://clerk.dev|user_pro", 20);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", {
        clerkUserId: "user_pro",
        stripeCustomerId: "cus_pro",
        stripeSubscriptionId: "sub_pro",
        status: "active",
        currentPeriodEnd: 1234567890,
        cancelAtPeriodEnd: false,
      });
    });

    const identity = t.withIdentity({
      tokenIdentifier: "https://clerk.dev|user_pro",
      subject: "user_pro",
    });

    const note21 = await identity.mutation(api.notes.createNote, {
      title: "n21",
    });
    expect(note21).toBeTruthy();

    // Insert notes 22-49 directly so we can exercise note 50 without
    // 30 extra round-trips through the mutation.
    await t.run(async ctx => {
      const user = await ctx.db
        .query("users")
        .filter(q =>
          q.eq(q.field("tokenIdentifier"), "https://clerk.dev|user_pro"),
        )
        .first();
      for (let i = 22; i <= 49; i++) {
        await ctx.db.insert("notes", {
          owner: user!._id,
          title: `note-${i}`,
          content: "{}",
        });
      }
    });

    const note50 = await identity.mutation(api.notes.createNote, {
      title: "n50",
    });
    expect(note50).toBeTruthy();
  });

  test("a Free user with a past_due subscription is treated as Free — 21st note is rejected", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithNotes(t, "https://clerk.dev|user_pastdue", 20);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", {
        clerkUserId: "user_pastdue",
        stripeCustomerId: "cus_pastdue",
        stripeSubscriptionId: "sub_pastdue",
        status: "past_due",
        currentPeriodEnd: 1234567890,
        cancelAtPeriodEnd: false,
      });
    });

    await expectNoteLimitRejection(
      t
        .withIdentity({
          tokenIdentifier: "https://clerk.dev|user_pastdue",
          subject: "user_pastdue",
        })
        .mutation(api.notes.createNote, { title: "n21" }),
    );
  });

  test("a Free user with a canceled subscription is treated as Free — 21st note is rejected", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithNotes(t, "https://clerk.dev|user_canceled", 20);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", {
        clerkUserId: "user_canceled",
        stripeCustomerId: "cus_canceled",
        stripeSubscriptionId: "sub_canceled",
        status: "canceled",
        currentPeriodEnd: 1234567890,
        cancelAtPeriodEnd: false,
      });
    });

    await expectNoteLimitRejection(
      t
        .withIdentity({
          tokenIdentifier: "https://clerk.dev|user_canceled",
          subject: "user_canceled",
        })
        .mutation(api.notes.createNote, { title: "n21" }),
    );
  });
});
