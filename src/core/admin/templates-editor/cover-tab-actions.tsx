"use client";

import { useState } from "react";

import { Button } from "@/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/ui/dialog";

import type { CoverLanguage } from "../templates/types";

import { coverCopy as COPY } from "./copy";
import { hasCover, type CoverSet } from "./cover-set";

type Props = {
  set: CoverSet;
  language: CoverLanguage;
  pending: boolean;
  onBackToStill: () => void;
  onTranslate: () => void;
  onClear: () => void;
};

// Below a cover tab's slots (T87): the card type, 「改回静态图卡片」, 「生成其他语言版本」 once there
// is an "after", and, on a language tab with a cover, deleting it (asks first: the language's
// pages change back to the common cover).
export function CoverTabActions({
  set,
  language,
  pending,
  onBackToStill,
  onTranslate,
  onClear,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {COPY.cardType(set.mediaType)}
      </span>
      {set.mediaType !== "image" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onBackToStill}
        >
          {COPY.backToStill}
        </Button>
      ) : null}
      {set.after ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onTranslate}
        >
          {COPY.translate}
        </Button>
      ) : null}
      {language.code !== null && hasCover(set) ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive ml-auto"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {COPY.clearLanguage(language.label)}
        </Button>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{COPY.clearLanguage(language.label)}</DialogTitle>
            <DialogDescription>
              {COPY.confirmClear(language.label)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {COPY.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onClear();
              }}
            >
              {COPY.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
