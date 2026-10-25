"use client";

import { useT } from "@/components/i18n/locale-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeaserFrame } from "./teaser-frame";
import type { Teaser } from "./teasers";

/**
 * The "More demos" lightbox. Lives in its own file so TeaserMoreDemos can load
 * it lazily (next/dynamic): Radix Dialog + this markup are not shipped with the
 * hero's first JS, only fetched when a visitor opens a card.
 */
export function TeaserModal({
  teaser,
  open,
  onClose,
  onCloseAutoFocus,
}: {
  /** Last teaser shown; kept while the exit animation runs after `open` flips. */
  teaser: Teaser | null;
  open: boolean;
  onClose: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-3xl gap-3 p-3 sm:p-4"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {teaser && (
          <>
            <div className="pr-8">
              <DialogTitle>{t(teaser.titleKey)}</DialogTitle>
              <DialogDescription className="mt-0.5">{t(teaser.subKey)}</DialogDescription>
            </div>
            <TeaserFrame
              key={teaser.id}
              teaser={teaser}
              ariaLabel={t(teaser.titleKey)}
              playLabel={t("teasers.playDemo")}
              durationLabel={t(teaser.durationLabelKey)}
              preload="none"
              autoPlay={open}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
