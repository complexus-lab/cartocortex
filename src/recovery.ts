// The first tab keeps an autosave copy in localStorage. This flag records whether that copy holds changes never saved to a file,
// so a restore after a crash opens as "unsaved" (bullet in the title, prompt before closing) instead of passing for a clean document.

export const UNSAVED_KEY = "mindmap.autosave.unsaved";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Scan = Store & Pick<Storage, "length" | "key">;

// Tabs after the first keep a copy of their document only while it holds unsaved changes.
const TAB_PREFIX = "mindmap.autosave.tab.";

export const saveTab = (id: number, json: string, store: Store = localStorage) => {
  try {
    store.setItem(TAB_PREFIX + id, json);
  } catch {
    /* storage unavailable or full: recovery is best-effort */
  }
};

export const clearTab = (id: number, store: Store = localStorage) => {
  try {
    store.removeItem(TAB_PREFIX + id);
  } catch {
    /* best-effort */
  }
};

/** Unsaved tabs left by a previous run, by id. */
export function leftTabs(store: Scan = localStorage): { id: number; json: string }[] {
  const out: { id: number; json: string }[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i) ?? "", id = k.startsWith(TAB_PREFIX) ? Number(k.slice(TAB_PREFIX.length)) : NaN;
      const json = Number.isInteger(id) && id > 0 ? store.getItem(k) : null;
      if (json) out.push({ id, json });
    }
  } catch {
    /* nothing to recover */
  }
  return out.sort((a, b) => a.id - b.id);
}

export function setUnsaved(unsaved: boolean, store: Store = localStorage) {
  try {
    if (unsaved) store.setItem(UNSAVED_KEY, "1");
    else store.removeItem(UNSAVED_KEY);
  } catch {
    /* storage unavailable: recovery is best-effort */
  }
}

export function wasUnsaved(store: Store = localStorage): boolean {
  try {
    return store.getItem(UNSAVED_KEY) === "1";
  } catch {
    return false;
  }
}
