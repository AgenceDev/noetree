import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getCredits = query({
  args: { clerkUserId: v.string() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const deductCredit = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const resetCredits = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const addCredits = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});
