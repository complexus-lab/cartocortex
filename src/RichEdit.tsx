import { CSSProperties, useEffect, useRef } from "react";
import { DomLike, Run, fromDom, isStyled, plainOf, toHtml, validRuns } from "./rich";

type Props = {
  text: string;
  runs?: Run[];
  multiline?: boolean;
  autoFocus?: boolean; // focus on mount and select everything, like a text input
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  /** Called when the editor loses focus. `changed` is false if neither text nor styling differ from the props. */
  onCommit: (text: string, runs: Run[] | undefined, changed: boolean) => void;
  onCancel?: () => void; // Escape
};

/**
 * Text editor that can style single words (bold, italic, strikethrough, colour) through the browser's
 * contenteditable commands. It never stores HTML: on blur the DOM is read back into plain text plus runs.
 */
export default function RichEdit({ text, runs, multiline, autoFocus, placeholder, className, style, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  // Fill once on mount: React must not manage the children of a contenteditable.
  useEffect(() => {
    const el = ref.current!;
    el.innerHTML = toHtml(text, validRuns(text, runs), !!multiline);
    if (autoFocus) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const read = () => {
    const found = fromDom(ref.current as unknown as DomLike, !!multiline);
    return { text: plainOf(found), runs: isStyled(found) ? found : undefined };
  };

  return (
    <div
      ref={ref}
      className={`rich${className ? ` ${className}` : ""}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline={!!multiline}
      data-placeholder={placeholder}
      onBlur={() => {
        if (cancelled.current) return;
        const now = read();
        const before = validRuns(text, runs);
        const changed = now.text !== text || JSON.stringify(now.runs ?? null) !== JSON.stringify(before && isStyled(before) ? before : null);
        onCommit(now.text, now.runs, changed);
      }}
      onKeyDown={(e) => {
        e.stopPropagation(); // the canvas shortcuts must not see keys typed here
        const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          ref.current!.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          if (onCancel) onCancel();
          else ref.current!.blur();
        } else if (mod && (e.key === "b" || e.key === "i")) {
          e.preventDefault();
          document.execCommand(e.key === "b" ? "bold" : "italic");
        }
      }}
      onPaste={(e) => {
        e.preventDefault(); // plain text only
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, multiline ? t : t.replace(/\s*[\r\n]+\s*/g, " "));
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
}
