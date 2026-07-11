"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "@/i18n/routing";
import {
  cancelSubscription,
  resumeSubscription,
} from "@/app/[locale]/(app)/settings/actions";

export default function SettingsPlanCard() {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const { isSignedIn } = useUser();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(false);

  // Pattern 3 / Pitfall 5: "skip" sentinel, never `enabled: false`.
  // Security: no clerkUserId arg — the query derives the caller's identity
  // from Convex auth itself (IDOR fix, 03-REVIEW.md CR-01).
  const { data: subscription, isPending: isSubscriptionPending } = useQuery(
    convexQuery(api.subscriptions.getSubscription, isSignedIn ? {} : "skip"),
  );

  const isPro = subscription?.status === "active";
  const isCancelling = isPro && subscription?.cancelAtPeriodEnd === true;

  // Pitfall 1 (MUST apply): currentPeriodEnd is stored in Unix SECONDS —
  // always construct the Date via * 1000, never render it raw.
  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000)
    : null;
  const formattedDate = renewalDate?.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  async function handleCancel() {
    setError(false);
    setIsPending(true);
    try {
      await cancelSubscription();
      setCancelDialogOpen(false);
    } catch (err) {
      console.error("cancelSubscription failed", err);
      setError(true);
    } finally {
      setIsPending(false);
    }
  }

  async function handleResume() {
    setError(false);
    setIsPending(true);
    try {
      await resumeSubscription();
    } catch (err) {
      console.error("resumeSubscription failed", err);
      setError(true);
    } finally {
      setIsPending(false);
    }
  }

  const showSkeleton = isSignedIn && isSubscriptionPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {t("planCardTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSkeleton ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <>
            <p className="text-base">
              {isPro ? t("proPlanName") : t("freePlanName")}
            </p>

            {!isPro && (
              <Button asChild>
                <Link href="/pricing">{t("upgradeCta")}</Link>
              </Button>
            )}

            {isPro && !isCancelling && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("renewsOn", { date: formattedDate ?? "" })}
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  {t("cancelCta")}
                </Button>
              </div>
            )}

            {isPro && isCancelling && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("cancelsOn", { date: formattedDate ?? "" })}
                </p>
                <Button onClick={handleResume} disabled={isPending}>
                  {t("resumeCta")}
                </Button>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{t("actionError")}</p>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cancelConfirmDesc", { date: formattedDate ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelDialogOpen(false)}>
              {t("cancelConfirmKeep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleCancel}
              disabled={isPending}
            >
              {t("cancelConfirmConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
