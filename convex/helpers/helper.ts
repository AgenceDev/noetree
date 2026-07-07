import { GenericQueryCtx } from "convex/server";
import { DataModel } from "../_generated/dataModel";

export const getUser = async (ctx: GenericQueryCtx<DataModel>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    console.error("User not authenticated");
    return null;
  }

  const user = await ctx.db
    .query("users")
    .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
    .first();

  if (!user) {
    console.error("User not found");
    return null;
  }
  return user;
};
