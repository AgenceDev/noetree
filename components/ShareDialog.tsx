"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Field, FieldLabel, FieldError } from "./ui/field";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Trash2, UserPlus } from "lucide-react";
import { ButtonGroup } from "./ui/button-group";

interface ShareDialogProps {
  noteId: Id<"notes">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareDialog({
  noteId,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const t = useTranslations("ShareDialog");
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryKey = convexQuery(api.notes.getNoteShares, { noteId }).queryKey;
  const { data: shares, isLoading } = useQuery(
    convexQuery(api.notes.getNoteShares, { noteId }),
  );

  const inviteUserMutation = useConvexMutation(api.notes.inviteUser);
  const removeShareMutation = useConvexMutation(api.notes.removeShare);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await inviteUserMutation({ noteId, email: targetEmail });
      if (res && res.success) {
        setEmail("");
        setSuccessMsg(t("successInvite"));
        queryClient.invalidateQueries({ queryKey });
      } else {
        const errorCode = res?.error;
        if (errorCode === "USER_NOT_FOUND") {
          setErrorMsg(t("errorUserNotFound"));
        } else if (errorCode === "ALREADY_SHARED") {
          setErrorMsg(t("errorAlreadyShared"));
        } else if (errorCode === "CANNOT_INVITE_SELF") {
          setErrorMsg(t("errorSelfInvite"));
        } else {
          setErrorMsg(t("errorGeneric"));
        }
      }
    } catch {
      setErrorMsg(t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (shareId: Id<"shares">) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await removeShareMutation({ shareId });
      queryClient.invalidateQueries({ queryKey });
    } catch {
      setErrorMsg(t("errorGeneric"));
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite}>
          <Field data-invalid={errorMsg ? "true" : undefined}>
            <FieldLabel htmlFor="email">{t("inputLabel")}</FieldLabel>
            <ButtonGroup>
              <Input
                id="email"
                type="email"
                placeholder={t("inputPlaceholder")}
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <Button type="submit" disabled={isSubmitting || !email.trim()}>
                <UserPlus />
                {t("invite")}
              </Button>
            </ButtonGroup>

            {errorMsg && <FieldError>{errorMsg}</FieldError>}

            {successMsg && (
              <p className="text-sm font-medium text-green-600 mt-1 animate-fadeIn">
                {successMsg}
              </p>
            )}
          </Field>
        </form>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {t("sharedWith")}
          </h4>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : !shares || shares.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              {t("noShares")}
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
              {shares.map(shareUser => (
                <div
                  key={shareUser._id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar>
                      <AvatarImage
                        src={
                          shareUser.picture
                            ? JSON.parse(shareUser.picture)
                            : undefined
                        }
                        alt={shareUser.name ?? "Avatar"}
                      />
                      <AvatarFallback>
                        {getInitials(shareUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {shareUser.name || shareUser.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {shareUser.name ? shareUser.email : t("pending")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(shareUser.shareId)}
                    title={t("remove")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
