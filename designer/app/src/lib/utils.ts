// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
