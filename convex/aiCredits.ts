import {
  query,
  internalMutation,
  mutation,
  MutationCtx,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";

const MONTHLY_CREDIT_QUOTA = 100;

// Reads the aiCredits row, validates sufficient balance, and atomically
// patches (or inserts) the row plus a "deduction" creditTransactions row —
// all within the single mutation transaction the caller is already inside.
// Never split across ctx.runMutation: doing so would reopen the TOCTOU
// window this helper exists to close (Convex serializes concurrent
// mutations touching the same document only when read+write happen inside
// one handler invocation).
async function applyDeduction(
  ctx: MutationCtx,
  clerkUserId: string,
  amount: number,
) {
  const credits = await ctx.db
    .query("aiCredits")
    .withIndex("by_clerkUserId", q => q.eq("clerkUserId", clerkUserId))
    .unique();

  const balance = credits?.balance ?? 0;
  if (balance < amount) {
    throw new ConvexError("INSUFFICIENT_CREDITS");
  }

  if (credits) {
    await ctx.db.patch(credits._id, { balance: balance - amount });
  } else {
    // Defensive-only branch: unreachable when balance < amount already
    // threw above (balance defaults to 0, and amount is always >= 1).
    await ctx.db.insert("aiCredits", {
      clerkUserId,
      balance: balance - amount,
      lastResetAt: Date.now(),
    });
  }

  await ctx.db.insert("creditTransactions", {
    clerkUserId,
    type: "deduction",
    amount: -amount,
    createdAt: Date.now(),
  });
}

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
  handler: async (ctx, args) => {
    await applyDeduction(ctx, args.clerkUserId, args.amount);
    return { success: true };
  },
});

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
