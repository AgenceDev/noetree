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

    // Security: getSubscription derives clerkUserId from the caller's
    // authenticated Convex identity, never a client-supplied argument
    // (IDOR fix, 03-REVIEW.md CR-01) — simulate that identity via withIdentity.
    const sub = await t
      .withIdentity({ subject: "user_1" })
      .query(api.subscriptions.getSubscription, {});

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

    const sub = await t
      .withIdentity({ subject: "user_1" })
      .query(api.subscriptions.getSubscription, {});
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

    const sub = await t
      .withIdentity({ subject: "user_1" })
      .query(api.subscriptions.getSubscription, {});
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

  test("getSubscription returns null for a signed-in caller with no row", async () => {
    const t = convexTest(schema, modules);

    const sub = await t
      .withIdentity({ subject: "user_nonexistent" })
      .query(api.subscriptions.getSubscription, {});

    expect(sub).toBeNull();
  });

  test("getSubscription returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_unauth",
      eventType: "checkout.session.completed",
      clerkUserId: "user_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    // No withIdentity() — simulates the pre-auth-fix IDOR attempt: a caller
    // with no session cannot read anyone's subscription (03-REVIEW.md CR-01).
    const sub = await t.query(api.subscriptions.getSubscription, {});

    expect(sub).toBeNull();
  });

  test("deleteSubscription removes the existing row for the given clerkUserId", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_setup_2",
      eventType: "checkout.session.completed",
      clerkUserId: "user_2",
      stripeCustomerId: "cus_2",
      stripeSubscriptionId: "sub_2",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    const result = await t.mutation(internal.subscriptions.deleteSubscription, {
      stripeEventId: "evt_3",
      eventType: "customer.subscription.deleted",
      clerkUserId: "user_2",
    });

    expect(result).toEqual({ success: true });

    const sub = await t
      .withIdentity({ subject: "user_2" })
      .query(api.subscriptions.getSubscription, {});
    expect(sub).toBeNull();
  });

  test("deleteSubscription is idempotent when replayed after the row is already gone", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_setup_2",
      eventType: "checkout.session.completed",
      clerkUserId: "user_2",
      stripeCustomerId: "cus_2",
      stripeSubscriptionId: "sub_2",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    await t.mutation(internal.subscriptions.deleteSubscription, {
      stripeEventId: "evt_3",
      eventType: "customer.subscription.deleted",
      clerkUserId: "user_2",
    });

    const replay = await t.mutation(internal.subscriptions.deleteSubscription, {
      stripeEventId: "evt_3",
      eventType: "customer.subscription.deleted",
      clerkUserId: "user_2",
    });

    expect(replay).toEqual({ alreadyProcessed: true });
  });

  test("deleteSubscription with a missing clerkUserId returns an anomaly sentinel without throwing", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.subscriptions.deleteSubscription, {
      stripeEventId: "evt_delete_anomaly",
      eventType: "customer.subscription.deleted",
      clerkUserId: undefined,
    });

    expect(result).toHaveProperty("anomaly");
  });

  test("markPastDue patches status to past_due via by_stripeSubscriptionId lookup, with no clerkUserId argument", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_setup_9",
      eventType: "checkout.session.completed",
      clerkUserId: "user_9",
      stripeCustomerId: "cus_9",
      stripeSubscriptionId: "sub_9",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    const result = await t.mutation(internal.subscriptions.markPastDue, {
      stripeEventId: "evt_4",
      eventType: "invoice.payment_failed",
      stripeSubscriptionId: "sub_9",
    });

    expect(result).toEqual({ success: true });

    const sub = await t
      .withIdentity({ subject: "user_9" })
      .query(api.subscriptions.getSubscription, {});
    expect(sub?.status).toBe("past_due");
  });

  test("markPastDue with an unmatched stripeSubscriptionId returns an anomaly sentinel without throwing or inserting", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.subscriptions.markPastDue, {
      stripeEventId: "evt_5",
      eventType: "invoice.payment_failed",
      stripeSubscriptionId: "sub_nonexistent",
    });

    expect(result).toHaveProperty("anomaly");

    const rowCount = await t.run(async ctx => {
      const rows = await ctx.db.query("subscriptions").collect();
      return rows.length;
    });
    expect(rowCount).toBe(0);
  });

  test("markPastDue is idempotent when replayed with the same stripeEventId", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.subscriptions.upsertSubscription, {
      stripeEventId: "evt_setup_9",
      eventType: "checkout.session.completed",
      clerkUserId: "user_9",
      stripeCustomerId: "cus_9",
      stripeSubscriptionId: "sub_9",
      status: "active",
      currentPeriodEnd: 1234567890,
      cancelAtPeriodEnd: false,
    });

    await t.mutation(internal.subscriptions.markPastDue, {
      stripeEventId: "evt_4",
      eventType: "invoice.payment_failed",
      stripeSubscriptionId: "sub_9",
    });

    const replay = await t.mutation(internal.subscriptions.markPastDue, {
      stripeEventId: "evt_4",
      eventType: "invoice.payment_failed",
      stripeSubscriptionId: "sub_9",
    });

    expect(replay).toEqual({ alreadyProcessed: true });

    const sub = await t
      .withIdentity({ subject: "user_9" })
      .query(api.subscriptions.getSubscription, {});
    expect(sub?.status).toBe("past_due");
  });
});
