// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { readFileSync } from 'node:fs';

// The single source for template slots, regions, colours and conventions. Dependency-free on purpose:
// the privileged submission and publish jobs load it without installing packages.
export const templateDefinitions = JSON.parse(readFileSync(new URL('../templates/templates.json', import.meta.url), 'utf8'));
