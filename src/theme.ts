import { hex } from "./textstyle";

/** Central topic and accent first, then six branch colours (the Glossolalie palette). */
export const CUSTOM_DEFAULT = ["#0d9488", "#0d9488", "#1e3a5f", "#156775", "#3d5f8a", "#0a6f66", "#5e7fa3"];

/** Seven valid colours: whatever the saved list gets right, defaults for the rest (a map file may hold anything). */
export const customColors = (saved?: string[]): string[] => CUSTOM_DEFAULT.map((d, i) => hex(saved?.[i]) ?? d);

/** The user-defined theme in the shape the built-in themes use. */
export function customTheme(saved?: string[]) {
  const [root, ...palette] = customColors(saved);
  return { name: "Custom", root, accent: root, palette };
}
