// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

/** A problem the user can fix; its message is shown as is. */
export class DesignError extends Error {}

export function fail(message: string): never { throw new DesignError(message); }
