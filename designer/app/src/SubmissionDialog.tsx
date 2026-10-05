// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useEffect, useRef, useState } from "react";
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
}: {
  sheet: string;
  textureId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [organization, setOrganization] = useState("");
  const [slug, setSlug] = useState("");
  const [usage, setUsage] = useState<SubmissionUsage>(submissionUsage[0]);
  const [opened, setOpened] = useState(false);
  const tooLarge = new Blob([sheet]).size > 5 * 1024 * 1024;
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="shortcut-dialog submission-dialog"
      aria-labelledby="submission-title"
      onClose={onClose}
    >
      <div>
        <h2 id="submission-title">Submit obstacle artwork</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close submission"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        Share your finished artwork with TrackDraw. We download your sheet and
        open a GitHub form. A GitHub account is required.
      </p>
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
          <input
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
          <input
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
          <select
            aria-label="Usage"
            value={usage}
            onChange={(event) =>
              setUsage(event.target.value as SubmissionUsage)
            }
          >
            {submissionUsage.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
        <p>
          Artwork stays your property. On GitHub, attach{" "}
          <strong>{textureId}.svg</strong> under Template sheets, check the
          details and confirm you have permission to publish it. You can attach
          more sheets there.
        </p>
        {tooLarge && (
          <p role="alert">
            This sheet exceeds the submission limit of 5 MB. Use smaller images
            or simplify the artwork before submitting.
          </p>
        )}
        <button
          className="primary"
          type="submit"
          disabled={!organization.trim() || tooLarge}
        >
          Download SVG and open GitHub
        </button>
        {opened && (
          <p role="status">
            Your sheet was downloaded. Attach it to the GitHub form. If the new
            tab was blocked,{" "}
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
    </dialog>
  );
}
