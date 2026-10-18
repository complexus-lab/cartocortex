// What an import could not carry over, counted per kind so the user sees it instead of finding it missing later.

export class Report {
  private seen = new Map<string, number>();

  add(what: string, count = 1) {
    if (count > 0) this.seen.set(what, (this.seen.get(what) ?? 0) + count);
  }

  /** "3 × images dropped", in first-seen order. */
  lines(): string[] {
    return [...this.seen].map(([what, n]) => (n > 1 ? `${n} × ${what}` : what));
  }
}
