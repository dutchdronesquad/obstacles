// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

export const submissionUsage = [
  "In TrackDraw only",
  "In TrackDraw, including offline track exports",
] as const;
export type SubmissionUsage = (typeof submissionUsage)[number];

export function submissionUrl(
  organization: string,
  slug: string,
  usage: SubmissionUsage,
): string {
  const url = new URL(
    "https://github.com/dutchdronesquad/track-assets/issues/new",
  );
  url.searchParams.set("template", "submit-collection.yml");
  url.searchParams.set("title", `collection: ${organization.trim()}`);
  url.searchParams.set("organization", organization.trim());
  url.searchParams.set("slug", slug.trim());
  url.searchParams.set("usage", usage);
  return url.href;
}
