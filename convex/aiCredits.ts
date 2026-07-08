import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const MONTHLY_CREDIT_QUOTA = 100;

export const getCredits = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

export const deductCredit = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
}); // LEAVE UNCHANGED — Phase 5 (CRED-04)

export const resetCredits = internalMutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_stripeEventId", q =>
        q.eq("stripeEventId", args.stripeEventId),
      )
      .unique();
    if (already) return { alreadyProcessed: true };

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", q =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();
    if (!subscription) {
      console.error(
        `resetCredits anomaly: no subscription found for stripeSubscriptionId=${args.stripeSubscriptionId} (stripeEventId=${args.stripeEventId})`,
      );
      return { anomaly: "no subscription for stripeSubscriptionId" };
    }

    const { clerkUserId } = subscription;

    const existingCredits = await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", clerkUserId))
      .unique();

    if (existingCredits) {
      await ctx.db.patch(existingCredits._id, {
        balance: MONTHLY_CREDIT_QUOTA,
        lastResetAt: Date.now(),
      });
    } else {
      await ctx.db.insert("aiCredits", {
        clerkUserId,
        balance: MONTHLY_CREDIT_QUOTA,
        lastResetAt: Date.now(),
      });
    }

    await ctx.db.insert("creditTransactions", {
      clerkUserId,
      type: "reset",
      amount: MONTHLY_CREDIT_QUOTA,
      createdAt: Date.now(),
    });

    await ctx.db.insert("processedStripeEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});

export const addCredits = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
}); // LEAVE UNCHANGED — Phase 5 (PAY-05)
