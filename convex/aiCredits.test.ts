import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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
