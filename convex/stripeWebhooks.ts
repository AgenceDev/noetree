import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Maps Stripe's richer subscription status union down to this app's 3-value
 * schema union. Dispatch-adjacent business logic — lives here, not in
 * subscriptions.ts, per D-04's "subscriptions.ts stays pure data-access" boundary.
 */
function mapStripeSubscriptionStatus(
  stripeStatus: string,
): "active" | "canceled" | "past_due" {
  switch (stripeStatus) {
    case "trialing":
    case "active":
      return "active";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
    default:
      return "past_due";
  }
}

export const processWebhookEvent = action({
  args: { event: v.any(), secret: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
      throw new Error("Unauthorized: invalid INTERNAL_WEBHOOK_SECRET");
    }

    switch (args.event.type) {
      case "checkout.session.completed": {
        const session = args.event.data.object;
        const clerkUserId = session.metadata?.clerkUserId;
        const stripeCustomerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        return await ctx.runMutation(
          internal.subscriptions.upsertSubscription,
          {
            stripeEventId: args.event.id,
            eventType: args.event.type,
            clerkUserId,
            stripeCustomerId,
            stripeSubscriptionId,
            status: mapStripeSubscriptionStatus(
              session.subscriptionSnapshot?.status ?? "active",
            ),
            currentPeriodEnd:
              session.subscriptionSnapshot?.currentPeriodEnd ?? 0,
            cancelAtPeriodEnd:
              session.subscriptionSnapshot?.cancelAtPeriodEnd ?? false,
          },
        );
      }

      case "customer.subscription.updated": {
        const subscription = args.event.data.object;
        const clerkUserId = subscription.metadata.clerkUserId;
        const stripeCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        const stripeSubscriptionId = subscription.id;
        const currentPeriodEnd =
          subscription.items?.data?.[0]?.current_period_end ?? 0;

        return await ctx.runMutation(
          internal.subscriptions.upsertSubscription,
          {
            stripeEventId: args.event.id,
            eventType: args.event.type,
            clerkUserId,
            stripeCustomerId,
            stripeSubscriptionId,
            status: mapStripeSubscriptionStatus(subscription.status),
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        );
      }

      case "customer.subscription.deleted": {
        const subscription = args.event.data.object;
        const clerkUserId = subscription.metadata.clerkUserId;

        return await ctx.runMutation(
          internal.subscriptions.deleteSubscription,
          {
            stripeEventId: args.event.id,
            eventType: args.event.type,
            clerkUserId,
          },
        );
      }

      case "invoice.paid":
      case "invoice.payment_failed":
      default:
        return { skipped: true };
    }
  },
});
