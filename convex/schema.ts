import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    picture: v.optional(v.string()),
    nickname: v.optional(v.string()),
    given_name: v.optional(v.string()),
    updated_at: v.optional(v.string()),
    family_name: v.optional(v.string()),
    phone_number: v.optional(v.string()),
    email_verified: v.optional(v.boolean()),
    phone_number_verified: v.optional(v.boolean()),
    role: v.id("roles"),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  roles: defineTable({
    role: v.string(),
  }),

  notes: defineTable({
    owner: v.id("users"),
    created_at: v.optional(v.string()),
    updated_at: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    childNotes: v.optional(v.array(v.id("notes"))),
    parentNote: v.optional(v.id("notes")),
    index: v.optional(v.float64()),
    isPinned: v.optional(v.boolean()),
  })
    .index("by_owner", ["owner", "parentNote"])
    .index("by_parent", ["parentNote"]),

  shares: defineTable({
    noteId: v.id("notes"),
    userId: v.optional(v.id("users")),
    email: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_note", ["noteId"])
    .index("by_email", ["email"])
    .index("by_user_note", ["userId", "noteId"])
    .index("by_email_note", ["email", "noteId"]),
});
