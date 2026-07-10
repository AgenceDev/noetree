import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.ts");

const SUBSCRIPTION_SEED = {
  clerkUserId: "user_3",
  stripeCustomerId: "cus_3",
  stripeSubscriptionId: "sub_3",
  status: "active" as const,
  currentPeriodEnd: 111,
  cancelAtPeriodEnd: false,
};

describe("aiCredits.resetCredits / getCredits", () => {
  it("inserts a new aiCredits row with balance 100 when none exists for the resolved clerkUserId", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", SUBSCRIPTION_SEED);
    });

    await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_5",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_3",
    });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_3",
    });
    expect(credits?.balance).toBe(100);
    expect(credits?.lastResetAt).toBeTypeOf("number");
  });

  it("patches an existing aiCredits row back to 100 (patch path, not insert)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", SUBSCRIPTION_SEED);
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_3",
        balance: 42,
        lastResetAt: 0,
      });
    });

    await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_patch",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_3",
    });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_3",
    });
    expect(credits?.balance).toBe(100);

    const allRows = await t.run(async ctx =>
      ctx.db.query("aiCredits").collect(),
    );
    expect(allRows.length).toBe(1);
  });

  it("is idempotent by stripeEventId — replay returns alreadyProcessed and does not duplicate the creditTransactions row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", SUBSCRIPTION_SEED);
    });

    const first = await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_5",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_3",
    });
    expect(first).not.toEqual({ alreadyProcessed: true });

    const second = await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_5",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_3",
    });
    expect(second).toEqual({ alreadyProcessed: true });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_3",
    });
    expect(credits?.balance).toBe(100);

    const resetTransactions = await t.run(async ctx => {
      const rows = await ctx.db.query("creditTransactions").collect();
      return rows.filter(row => row.type === "reset");
    });
    expect(resetTransactions.length).toBe(1);
  });

  it("returns an anomaly sentinel and does not throw when stripeSubscriptionId matches no subscriptions row", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_6",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_nonexistent",
    });
    expect(result).toEqual({
      anomaly: "no subscription for stripeSubscriptionId",
    });

    const aiCreditsRows = await t.run(async ctx =>
      ctx.db.query("aiCredits").collect(),
    );
    expect(aiCreditsRows.length).toBe(0);

    const creditTransactionRows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(creditTransactionRows.length).toBe(0);
  });

  it("inserts exactly one creditTransactions row of type reset with amount 100 on a successful reset", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("subscriptions", SUBSCRIPTION_SEED);
    });

    await t.mutation(internal.aiCredits.resetCredits, {
      stripeEventId: "evt_7",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_3",
    });

    const rows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      clerkUserId: "user_3",
      type: "reset",
      amount: 100,
    });
  });

  it("getCredits returns null for a clerkUserId with no aiCredits row", async () => {
    const t = convexTest(schema, modules);
    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_nonexistent",
    });
    expect(credits).toBeNull();
  });
});

describe("aiCredits.deductCredit", () => {
  it("deducts 1 credit from balance=5, patches to 4, and records a deduction transaction", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 5,
        lastResetAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.aiCredits.deductCredit, {
      clerkUserId: "user_x",
      amount: 1,
    });
    expect(result).toEqual({ success: true });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(4);

    const rows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      clerkUserId: "user_x",
      type: "deduction",
      amount: -1,
    });
  });

  it("deducts from balance=1 to 0", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 1,
        lastResetAt: Date.now(),
      });
    });

    await t.mutation(internal.aiCredits.deductCredit, {
      clerkUserId: "user_x",
      amount: 1,
    });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(0);
  });

  it("throws INSUFFICIENT_CREDITS at balance=0 with no patch and no transaction row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 0,
        lastResetAt: Date.now(),
      });
    });

    await expect(
      t.mutation(internal.aiCredits.deductCredit, {
        clerkUserId: "user_x",
        amount: 1,
      }),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(0);

    const rows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(rows.length).toBe(0);
  });

  it("treats a clerkUserId with no aiCredits row as balance 0 and throws INSUFFICIENT_CREDITS", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.aiCredits.deductCredit, {
        clerkUserId: "user_nonexistent",
        amount: 1,
      }),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const rows = await t.run(async ctx => ctx.db.query("aiCredits").collect());
    expect(rows.length).toBe(0);
  });

  it("is TOCTOU-safe: two concurrent deductions at balance=1 never both succeed, final balance is 0", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 1,
        lastResetAt: Date.now(),
      });
    });

    const results = await Promise.allSettled([
      t.mutation(internal.aiCredits.deductCredit, {
        clerkUserId: "user_x",
        amount: 1,
      }),
      t.mutation(internal.aiCredits.deductCredit, {
        clerkUserId: "user_x",
        amount: 1,
      }),
    ]);

    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(0);
  });

  it("allows creditTransactions rows with type 'refund' (schema validation passes)", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async ctx =>
        ctx.db.insert("creditTransactions", {
          clerkUserId: "user_x",
          type: "refund",
          amount: 1,
          createdAt: Date.now(),
        }),
      ),
    ).resolves.toBeDefined();
  });
});

const IDENTITY = {
  subject: "user_x",
  tokenIdentifier: "https://clerk.dev|user_x",
};

describe("aiCredits.runAiAction", () => {
  it("deducts 1 credit from the authenticated identity's balance and records one deduction transaction", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 3,
        lastResetAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.aiCredits.runAiAction, {});
    expect(result).toEqual({ success: true });

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(2);

    const rows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      clerkUserId: "user_x",
      type: "deduction",
      amount: -1,
    });
  });

  it("throws INSUFFICIENT_CREDITS at balance=0 without mutating balance or inserting a transaction", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 0,
        lastResetAt: Date.now(),
      });
    });

    await expect(
      t.withIdentity(IDENTITY).mutation(api.aiCredits.runAiAction, {}),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const credits = await t.query(api.aiCredits.getCredits, {
      clerkUserId: "user_x",
    });
    expect(credits?.balance).toBe(0);

    const rows = await t.run(async ctx =>
      ctx.db.query("creditTransactions").collect(),
    );
    expect(rows.length).toBe(0);
  });

  it("throws INSUFFICIENT_CREDITS when the identity has no aiCredits row", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.withIdentity(IDENTITY).mutation(api.aiCredits.runAiAction, {}),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
  });

  it("throws when called with no authenticated identity", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 5,
        lastResetAt: Date.now(),
      });
    });

    await expect(t.mutation(api.aiCredits.runAiAction, {})).rejects.toThrow();
  });
});

describe("aiCredits.getMyCredits", () => {
  it("returns the authenticated identity's aiCredits row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 7,
        lastResetAt: Date.now(),
      });
    });

    const credits = await t
      .withIdentity(IDENTITY)
      .query(api.aiCredits.getMyCredits, {});
    expect(credits?.balance).toBe(7);
  });

  it("returns null when the identity has no aiCredits row", async () => {
    const t = convexTest(schema, modules);

    const credits = await t
      .withIdentity(IDENTITY)
      .query(api.aiCredits.getMyCredits, {});
    expect(credits).toBeNull();
  });

  it("returns null when there is no authenticated identity", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 7,
        lastResetAt: Date.now(),
      });
    });

    const credits = await t.query(api.aiCredits.getMyCredits, {});
    expect(credits).toBeNull();
  });
});
