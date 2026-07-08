import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// Node.js is the default Next.js Route Handler runtime — keep it that way.
// `stripe.webhooks.constructEvent` (the synchronous signature-verification
// variant used below) requires Node's crypto primitives; only
// `constructEventAsync` supports an edge-style runtime, and there is no
// reason to switch to it for this route.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    // Spoofed/forged payload or missing/invalid Stripe-Signature header (D-10,
    // T-02-01) — never a 500, Stripe would otherwise retry a request that can
    // never succeed.
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      // A Checkout Session does not carry status/period-end fields natively —
      // fetch the full Subscription object once, only for this event type.
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription,
      );
      (
        event.data.object as Stripe.Checkout.Session & {
          subscriptionSnapshot?: {
            status: string;
            currentPeriodEnd: number;
            cancelAtPeriodEnd: boolean;
          };
        }
      ).subscriptionSnapshot = {
        status: subscription.status,
        currentPeriodEnd: subscription.items.data[0]?.current_period_end ?? 0,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    }
  }

  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.action(api.stripeWebhooks.processWebhookEvent, {
      event,
      secret: process.env.INTERNAL_WEBHOOK_SECRET!,
    });
    // Covers D-11 success, D-12 anomaly, and D-13 no-op — the dispatcher
    // action resolves normally (never throws) in all three cases.
    return new Response(null, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Unauthorized")) {
      // D-02/D-10 — shared-secret mismatch is an auth failure, not a
      // transient infra failure, so it must map to 400, never 500.
      return new Response("Unauthorized", { status: 400 });
    }
    // D-11 — genuine processing failure (Convex unreachable, unhandled
    // exception). 500 lets Stripe's retry-with-backoff self-heal transient
    // failures.
    return new Response("Webhook processing failed", { status: 500 });
  }
}
