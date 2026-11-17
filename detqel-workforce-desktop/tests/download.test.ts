import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { saveBlobDownload, saveDownload } from "../frontend/src/lib/download.ts";

function mockDocument(t: TestContext, document: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); });
}

test("downloads start once, return their real size, and clean up the object URL", async t => {
  let clicks = 0;
  let removed = 0;
  let appended = 0;
  const anchor = { href: "", download: "", click: () => { clicks++; }, remove: () => { removed++; } };
  mockDocument(t, { createElement: () => anchor, body: { appendChild: () => { appended++; } } });
  const revoke = t.mock.method(URL, "revokeObjectURL");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const receipt = saveDownload({ fileName: "Brief.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("%PDF-test").toString("base64") });
  assert.deepEqual(receipt, { fileName: "Brief.pdf", size: 9 });
  assert.equal(anchor.download, "Brief.pdf");
  assert.equal(clicks, 1);
  assert.equal(appended, 1);
  assert.equal(removed, 1);
  assert.equal(revoke.mock.callCount(), 0);
  t.mock.timers.tick(1000);
  assert.equal(revoke.mock.callCount(), 1);
});

test("a failed download throws before success feedback and still releases resources", t => {
  let removed = false;
  mockDocument(t, { createElement: () => ({ click: () => { throw new Error("download blocked"); }, remove: () => { removed = true; } }), body: { appendChild: () => {} } });
  const revoke = t.mock.method(URL, "revokeObjectURL");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.throws(() => saveBlobDownload(new Blob(["data"]), "Brief.txt"), /download blocked/);
  assert.equal(removed, true);
  t.mock.timers.tick(1000);
  assert.equal(revoke.mock.callCount(), 1);
});
