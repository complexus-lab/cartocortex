import { expect, test } from "vitest";
import { MAX_UNZIPPED, exportXmind, importXmind } from "./xmind";
import { mk } from "./model";

/** A one-entry zip whose entry is deflated, claiming `claimed` bytes once unpacked. */
function deflatedZip(name: string, deflated: Uint8Array, claimed: number): Uint8Array {
  const nameB = new TextEncoder().encode(name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 8, true);
  local.setUint32(18, deflated.length, true); local.setUint32(22, claimed, true); local.setUint16(26, nameB.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(10, 8, true);
  central.setUint32(20, deflated.length, true); central.setUint32(24, claimed, true); central.setUint16(28, nameB.length, true);
  const end = new DataView(new ArrayBuffer(22));
  const cdAt = 30 + nameB.length + deflated.length;
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true);
  end.setUint32(12, 46 + nameB.length, true); end.setUint32(16, cdAt, true);
  return Uint8Array.from([...new Uint8Array(local.buffer), ...nameB, ...deflated, ...new Uint8Array(central.buffer), ...nameB, ...new Uint8Array(end.buffer)]);
}

test("a zip that claims to unpack past the limit is refused before anything is inflated", async () => {
  const good = exportXmind(mk("x"));
  const at = [...good.keys()].find((i) => new DataView(good.buffer).getUint32(i, true) === 0x02014b50)!;
  const bad = good.slice();
  new DataView(bad.buffer).setUint32(at + 24, MAX_UNZIPPED + 1, true); // the entry's declared size
  await expect(importXmind(bad)).rejects.toThrow(/unpacks to more than/);
});

test("a deflate bomb that lies about its size is stopped while it unpacks", async () => {
  const zeros = new Uint8Array(MAX_UNZIPPED + 1024 * 1024);
  const deflated = new Uint8Array(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  expect(deflated.length).toBeLessThan(1024 * 1024); // tiny on disk
  await expect(importXmind(deflatedZip("content.json", deflated, 100))).rejects.toThrow(/unpacks to more than/); // claims 100 bytes
}, 30000);

test("ordinary maps still open", async () => {
  const back = await importXmind(exportXmind({ ...mk("Plan"), children: [mk("a"), mk("b")] }));
  expect(back.children.map((c) => c.text)).toEqual(["a", "b"]);
});
