"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { redirect as localeRedirect, routing } from "@/i18n/routing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(locale: string): Promise<void> {
  // T-03-01: never interpolate an unvalidated locale into a redirect URL.
  const safeLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    // D-02: signed-out visitor -> Clerk hosted sign-in, no Stripe call.
    redirectToSignIn({ returnBackUrl: `/${safeLocale}/pricing` });
    return;
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const existing = await convex.query(api.subscriptions.getSubscription, {
    clerkUserId: userId,
  });

  // D-08: already active -> short-circuit straight to the success page, no Stripe call.
  if (existing?.status === "active") {
    localeRedirect({ href: "/checkout/success", locale: safeLocale });
    return;
  }

  const baseUrl = process.env.APP_URL!;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // D-06: only pass `customer` when a row already exists — omit the key
      // entirely (not `customer: undefined`) so Stripe creates a fresh
      // Customer from the collected email when there is no existing row.
      ...(existing?.stripeCustomerId
        ? { customer: existing.stripeCustomerId }
        : {}),
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      // D-07 (locked Phase 1): clerkUserId sourced ONLY from auth() (T-03-02),
      // written into both session.metadata and subscription_data.metadata.
      metadata: { clerkUserId: userId },
      subscription_data: {
        metadata: { clerkUserId: userId },
      },
      success_url: `${baseUrl}/${safeLocale}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${safeLocale}/pricing`,
    });
  } catch {
    // UI-SPEC "Error state" — narrow try around only the Stripe API call
    // (Pitfall 4: redirect() must never be inside this try/catch).
    throw new Error("checkoutSessionCreationFailed");
  }

  if (session.url) {
    redirect(session.url);
  }
}
