import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const upsertSubscription = internalMutation({
  args: {
    clerkUserId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const deleteSubscription = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});
