// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

/** Bounded immutable snapshots; undo includes colours, template, artwork and filename. */
export class History<T> {
  private entries: string[];
  private cursor = 0;
  private byteBudget: number;
  constructor(initial: T, maxBytes = 64 * 1024 * 1024) {
    this.entries = [JSON.stringify(initial)];
    this.byteBudget = maxBytes;
  }
  get canUndo() {
    return this.cursor > 0;
  }
  get canRedo() {
    return this.cursor < this.entries.length - 1;
  }
  push(value: T) {
    const next = JSON.stringify(value);
    if (next === this.entries[this.cursor]) return;
    this.entries = [...this.entries.slice(0, this.cursor + 1), next];
    if (this.entries.length > 60) this.entries.shift();
    while (this.entries.length > 2 && this.entries.reduce((bytes, entry) => bytes + entry.length * 2, 0) > this.byteBudget) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }
  step(direction: -1 | 1): T | undefined {
    if (direction === -1 ? !this.canUndo : !this.canRedo) return;
    this.cursor += direction;
    return JSON.parse(this.entries[this.cursor]) as T;
  }
}
