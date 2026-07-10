"use client";

import { useTranslations } from "next-intl";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/routing";
import { api } from "@/convex/_generated/api";
import { createTopupCheckoutSession } from "@/app/[locale]/(app)/notes/actions";

interface CreditsExhaustedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreditsExhaustedDialog({
  open,
  onOpenChange,
}: CreditsExhaustedDialogProps) {
  const t = useTranslations("AiCredits");

  // D-11: same active-only Pro check established in Phase 4 enforcement —
  // branches the dialog's CTA between "Upgrade to Pro" (Free) and
  // "Buy 50 credits" (Pro-at-zero).
  const { data: subscription } = useQuery(
    convexQuery(api.subscriptions.getSubscription, {}),
  );
  const isPro = subscription?.status === "active";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {isPro ? t("dialogBodyPro") : t("dialogBodyFree")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("dismiss")}</Button>
          </DialogClose>
          {isPro ? (
            <form action={createTopupCheckoutSession}>
              <Button type="submit">{t("topupCta")}</Button>
            </form>
          ) : (
            <Button asChild>
              <Link href="/pricing">{t("upgradeCta")}</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
