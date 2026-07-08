import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.*s");

describe("subscriptions", () => {
  test("upsertSubscription creates a subscriptions row and getSubscription reads it back", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    expect(result).toEqual({ success: true });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_1",
    });

    expect(sub).not.toBeNull();
    expect(sub?.clerkUserId).toBe("user_1");
    expect(sub?.stripeSubscriptionId).toBe("sub_1");
    expect(sub?.status).toBe("active");
  });

  test("upsertSubscription is idempotent on replayed stripeEventId (no duplicate write)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    const replay = await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "past_due",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    expect(replay).toEqual({ alreadyProcessed: true });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_1",
    });
    expect(sub?.status).toBe("active");

    const rowCount = await t.run(async ctx => {
      const rows = await ctx.db.query("subscriptions").collect();
      return rows.length;
    });
    expect(rowCount).toBe(1);
  });

  test("upsertSubscription with a new stripeEventId patches the existing row instead of inserting a second one", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_2",
      eventType: "customer.subscription.updated",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "past_due",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_1",
    });
    expect(sub?.status).toBe("past_due");

    const rowCount = await t.run(async ctx => {
      const rows = await ctx.db.query("subscriptions").collect();
      return rows.length;
    });
    expect(rowCount).toBe(1);
  });

  test("upsertSubscription with a missing clerkUserId returns an anomaly sentinel without throwing and writes no row", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_anomaly",
      eventType: "checkout.session.completed",
      clerkUserId: undefined,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    expect(result).toHaveProperty("anomaly");

    const rowCount = await t.run(async ctx => {
      const rows = await ctx.db.query("subscriptions").collect();
      return rows.length;
    });
    expect(rowCount).toBe(0);
  });

  test("getSubscription returns null for a clerkUserId with no row", async () => {
    const t = convexTest(schema, modules);

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_nonexistent",
    });

    expect(sub).toBeNull();
  });
});
