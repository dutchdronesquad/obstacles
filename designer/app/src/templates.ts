// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import type { TemplateDefinitions } from '@track-assets/designer-core';
import definitions from '../../../templates/templates.json';
import gate from '../../../templates/gate-standard-v1.svg?raw';
import flag from '../../../templates/corner-flag-v1.svg?raw';

// JSON imports widen literal strings and tuples; the repository validates this shared file.
export const templates = definitions as unknown as TemplateDefinitions;
export const sheets: Record<string, string> = {
  'gate-standard-v1': gate,
  'corner-flag-v1': flag,
};
