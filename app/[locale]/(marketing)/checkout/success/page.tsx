import { auth } from "@clerk/nextjs/server";
import { redirect, routing } from "@/i18n/routing";
import { SuccessStatus } from "./SuccessStatus";

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales as readonly string[]).includes(rawLocale)
    ? rawLocale
    : routing.defaultLocale;

  const { userId } = await auth();

  if (!userId) {
    // D-12: no user resolved server-side — send back to pricing (internal route).
    redirect({ href: "/pricing", locale });
    return;
  }

  // D-12: clerkUserId is resolved server-side via Clerk auth() and handed to
  // the reactive client child. This boundary never fetches the checkout
  // session server-side; session_id (if present in the URL) is a debugging
  // reference only — Convex is the sole source of truth.
  return <SuccessStatus clerkUserId={userId} locale={locale} />;
}
