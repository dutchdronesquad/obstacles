// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useState, type RefObject } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { DropdownSelect } from "./DropdownSelect";
import { X } from "@phosphor-icons/react";
import { downloadSheet } from "./browser.ts";
import {
  submissionUrl,
  submissionUsage,
  type SubmissionUsage,
} from "./submission.ts";

export function SubmissionDialog({
  sheet,
  textureId,
  onClose,
  triggerRef,
}: {
  sheet: string;
  textureId: string;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [organization, setOrganization] = useState("");
  const [slug, setSlug] = useState("");
  const [usage, setUsage] = useState<SubmissionUsage>(submissionUsage[0]);
  const [opened, setOpened] = useState(false);
  const tooLarge = new Blob([sheet]).size > 5 * 1024 * 1024;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="shortcut-dialog submission-dialog"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <DialogTitle>Submit obstacle artwork</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close submission">
              <X size={18} aria-hidden />
            </Button>
          </DialogClose>
        </div>
        <DialogDescription>
          Share your finished artwork with TrackDraw. We download your sheet and
          open a GitHub form. A GitHub account is required.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!organization.trim() || tooLarge) return;
            window.open(
              submissionUrl(organization, slug, usage),
              "_blank",
              "noopener,noreferrer",
            );
            downloadSheet(sheet, textureId);
            setOpened(true);
          }}
        >
          <label>
            Organization
            <Input
              autoFocus
              required
              maxLength={120}
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              autoComplete="organization"
            />
          </label>
          <label>
            Short name (optional)
            <Input
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="example-racing"
              aria-describedby="submission-slug-help"
            />
          </label>
          <p id="submission-slug-help">
            Used in web addresses. Leave empty to use your organization name.
          </p>
          <label>
            Usage
            <DropdownSelect
              label="Usage"
              value={usage}
              choices={submissionUsage.map((value) => ({
                value,
                label: value,
              }))}
              onChange={setUsage}
            />
          </label>
          <p>
            Artwork stays your property. On GitHub, attach{" "}
            <strong>{textureId}.svg</strong> under Template sheets, check the
            details and confirm you have permission to publish it. You can
            attach more sheets there.
          </p>
          {tooLarge && (
            <p role="alert">
              This sheet exceeds the submission limit of 5 MB. Use smaller
              images or simplify the artwork before submitting.
            </p>
          )}
          <Button type="submit" disabled={!organization.trim() || tooLarge}>
            Download SVG and open GitHub
          </Button>
          {opened && (
            <p role="status">
              Your sheet was downloaded. Attach it to the GitHub form. If the
              new tab was blocked,{" "}
              <a
                href={submissionUrl(organization, slug, usage)}
                target="_blank"
                rel="noreferrer"
              >
                open the form here
              </a>
              .
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
