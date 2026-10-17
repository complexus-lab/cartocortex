import { expect, test } from "vitest";
import { mapSvg } from "./export";
import { layout, mk, thumbW, validImage, widthOf } from "./model";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const img = (over: object = {}) => ({ src: PNG, w: 200, h: 100, ...over });

test("validImage accepts embedded raster images only", () => {
  expect(validImage(img())).toBe(true);
  expect(validImage(img({ src: PNG.replace("png", "jpeg") }))).toBe(true);
  for (const src of [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", // SVG can carry script
    "data:text/html;base64,PGI+eDwvYj4=",
    "javascript:alert(1)",
    "https://example.com/x.png", // nothing is fetched from the network
    PNG + '" onload="x',
    "data:image/png;base64,",
    "data:image/png;base64," + "A".repeat(1_000_001),
  ]) expect(validImage(img({ src })), src.slice(0, 40)).toBe(false);
  for (const bad of [{ w: 0 }, { h: -1 }, { w: NaN }, { w: 5000 }, { h: "9" }]) expect(validImage(img(bad))).toBe(false);
  expect([validImage(undefined), validImage({} as never), validImage(null as never)]).toEqual([false, false, false]);
});

test("thumbnails keep the aspect ratio within bounds, and make the topic wider", () => {
  expect([thumbW({ w: 200, h: 100 }), thumbW({ w: 1000, h: 100 }), thumbW({ w: 10, h: 100 }), thumbW({ w: 100, h: 100 })]).toEqual([44, 48, 14, 22]);
  const plain = mk("a longer topic");
  expect(widthOf({ ...plain, image: img() })).toBe(widthOf(plain) + 44 + 6);
  expect(widthOf({ ...plain, image: img({ src: "javascript:x" }) })).toBe(widthOf(plain)); // an invalid image takes no room
});

test("svg export embeds valid images only", () => {
  const good = { ...mk("with picture"), image: img() }, bad = { ...mk("bad picture"), image: img({ src: 'data:image/png;base64,AA" onload="x' }) };
  const r = { ...mk("root"), children: [good, bad] };
  const { svg } = mapSvg(r, layout(r), () => "#000");
  expect(svg.match(/<image /g)).toHaveLength(1);
  expect(svg).toContain(`href="${PNG}"`);
  expect(svg).not.toContain("onload");
});
