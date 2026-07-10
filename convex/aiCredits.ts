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

// Security: clerkUserId is derived exclusively from the caller's
// authenticated Convex identity (never a client-supplied argument) so a
// signed-in user cannot deduct credits from — or read the balance of —
// another user's account (IDOR — mirrors subscriptions.ts getSubscription
// and 03-REVIEW.md CR-01).
export const runAiAction = mutation({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("UNAUTHENTICATED");
    const clerkUserId = identity.subject;

    // Deduct + placeholder action + refund all share this single mutation
    // transaction (never split via ctx.runMutation — Pitfall 1: reopens
    // the TOCTOU window applyDeduction exists to close). Propagates
    // INSUFFICIENT_CREDITS to the client when the balance is too low.
    await applyDeduction(ctx, clerkUserId, 1);

    // Placeholder action (D-01): no real LLM call this phase, always
    // succeeds. The refund branch below is implemented but intentionally
    // unreachable while actionSucceeded is hardcoded true (D-04/D-06) —
    // it exists so a future real action can flip this to a real result
    // without restructuring the transaction.
    const actionSucceeded = true;

    if (!actionSucceeded) {
      const credits = await ctx.db
        .query("aiCredits")
        .withIndex("by_clerkUserId", q => q.eq("clerkUserId", clerkUserId))
        .unique();
      if (credits) {
        await ctx.db.patch(credits._id, { balance: credits.balance + 1 });
      }
      await ctx.db.insert("creditTransactions", {
        clerkUserId,
        type: "refund",
        amount: 1,
        createdAt: Date.now(),
      });
    }

    return { success: actionSucceeded };
  },
});

export const getMyCredits = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .unique();
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
  args: {
    clerkUserId: v.string(),
    amount: v.number(),
    stripeEventId: v.string(),
    eventType: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_stripeEventId", q =>
        q.eq("stripeEventId", args.stripeEventId),
      )
      .unique();
    if (already) return { alreadyProcessed: true };

    const existingCredits = await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existingCredits) {
      await ctx.db.patch(existingCredits._id, {
        balance: existingCredits.balance + args.amount,
      });
    } else {
      await ctx.db.insert("aiCredits", {
        clerkUserId: args.clerkUserId,
        balance: args.amount,
        lastResetAt: Date.now(),
      });
    }

    await ctx.db.insert("creditTransactions", {
      clerkUserId: args.clerkUserId,
      type: "topup",
      amount: args.amount,
      createdAt: Date.now(),
      ...(args.stripePaymentIntentId
        ? { stripePaymentIntentId: args.stripePaymentIntentId }
        : {}),
    });

    await ctx.db.insert("processedStripeEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });

    return { credited: args.amount };
  },
});
