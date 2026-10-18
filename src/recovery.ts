// The first tab keeps an autosave copy in localStorage. This flag records whether that copy holds changes never saved to a file,
// so a restore after a crash opens as "unsaved" (bullet in the title, prompt before closing) instead of passing for a clean document.

export const UNSAVED_KEY = "mindmap.autosave.unsaved";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
