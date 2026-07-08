import { convexTest } from "convex-test";
import { describe, expect, it, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.ts");

const TEST_SECRET = "test-shared-secret";

const seedCheckoutEvent = (
  id: string,
  clerkUserId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
) => ({
  id,
  type: "checkout.session.completed",
  data: {
    object: {
      metadata: { clerkUserId },
      customer: stripeCustomerId,
      subscription: stripeSubscriptionId,
      subscriptionSnapshot: {
        status: "active",
        currentPeriodEnd: 555,
        cancelAtPeriodEnd: false,
      },
    },
  },
});

describe("stripeWebhooks.processWebhookEvent", () => {
  beforeEach(() => {
    process.env.INTERNAL_WEBHOOK_SECRET = TEST_SECRET;
  });

  it("throws an Unauthorized-prefixed error when the secret does not match", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.stripeWebhooks.processWebhookEvent, {
        secret: "wrong-secret",
        event: {
          id: "evt_bad",
          type: "checkout.session.completed",
          data: { object: {} },
        },
      }),
    ).rejects.toThrow(/^Unauthorized/);
  });

  it("checkout.session.completed creates a subscriptions row with resolved clerkUserId", async () => {
    const t = convexTest(schema, modules);

    await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: seedCheckoutEvent("evt_10", "user_10", "cus_10", "sub_10"),
    });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_10",
    });

    expect(sub).not.toBeNull();
    expect(sub?.stripeCustomerId).toBe("cus_10");
    expect(sub?.stripeSubscriptionId).toBe("sub_10");
    expect(sub?.status).toBe("active");
    expect(sub?.currentPeriodEnd).toBe(555);
  });

  it("checkout.session.completed with null metadata does not throw and hits the D-12 anomaly path", async () => {
    const t = convexTest(schema, modules);

    const result = await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: {
        id: "evt_10b",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: null,
            customer: "cus_10b",
            subscription: "sub_10b",
            subscriptionSnapshot: {
              status: "active",
              currentPeriodEnd: 555,
              cancelAtPeriodEnd: false,
            },
          },
        },
      },
    });

    expect(result).toEqual({ anomaly: "missing clerkUserId" });
  });

  it("customer.subscription.updated patches the existing row's status and cancelAtPeriodEnd", async () => {
    const t = convexTest(schema, modules);

    await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: seedCheckoutEvent("evt_10", "user_10", "cus_10", "sub_10"),
    });

    await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: {
        id: "evt_11",
        type: "customer.subscription.updated",
        data: {
          object: {
            metadata: { clerkUserId: "user_10" },
            customer: "cus_10",
            id: "sub_10",
            status: "past_due",
            cancel_at_period_end: true,
            items: { data: [{ current_period_end: 999 }] },
          },
        },
      },
    });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_10",
    });

    expect(sub?.status).toBe("past_due");
    expect(sub?.cancelAtPeriodEnd).toBe(true);
    expect(sub?.currentPeriodEnd).toBe(999);
  });

  it("customer.subscription.deleted removes the existing row for the resolved clerkUserId", async () => {
    const t = convexTest(schema, modules);

    await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: seedCheckoutEvent("evt_10", "user_10", "cus_10", "sub_10"),
    });

    await t.action(api.stripeWebhooks.processWebhookEvent, {
      secret: TEST_SECRET,
      event: {
        id: "evt_12",
        type: "customer.subscription.deleted",
        data: {
          object: {
            metadata: { clerkUserId: "user_10" },
          },
        },
      },
    });

    const sub = await t.query(api.subscriptions.getSubscription, {
      clerkUserId: "user_10",
    });

    expect(sub).toBeNull();
  });

  it.each([
    ["trialing", "active"],
    ["active", "active"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["incomplete", "past_due"],
    ["canceled", "canceled"],
    ["incomplete_expired", "canceled"],
    ["paused", "past_due"],
  ])(
    "maps Stripe subscription status %s to %s via customer.subscription.updated dispatch",
    async (stripeStatus, expectedStatus) => {
      const t = convexTest(schema, modules);

      await t.action(api.stripeWebhooks.processWebhookEvent, {
        secret: TEST_SECRET,
        event: seedCheckoutEvent(
          "evt_map_setup",
          "user_map",
          "cus_map",
          "sub_map",
        ),
      });

      await t.action(api.stripeWebhooks.processWebhookEvent, {
        secret: TEST_SECRET,
        event: {
          id: `evt_map_${stripeStatus}`,
          type: "customer.subscription.updated",
          data: {
            object: {
              metadata: { clerkUserId: "user_map" },
              customer: "cus_map",
              id: "sub_map",
              status: stripeStatus,
              cancel_at_period_end: false,
              items: { data: [{ current_period_end: 111 }] },
            },
          },
        },
      });

      const sub = await t.query(api.subscriptions.getSubscription, {
        clerkUserId: "user_map",
      });

      expect(sub?.status).toBe(expectedStatus);
    },
  );
});
