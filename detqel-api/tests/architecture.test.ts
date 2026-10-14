import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

test("HTTP and application layers do not depend on database implementations", async () => {
  for (const file of await files(path.join(root, "modules"))) {
    if (!/[/\\](controllers|services|routes|validation)[/\\]/.test(file)) continue;
    const source = await readFile(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements.filter(ts.isImportDeclaration)) {
      const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
      assert.ok(!specifier.includes("infrastructure/") && !specifier.includes("drizzle") && !specifier.includes("postgres"), `${file} imports ${specifier}`);
    }
    assert.doesNotMatch(source, /\bdbHandlers\b|\brawDb\b/, file);
  }
});

test("every feature repository has an explicit implemented contract", async () => {
  const implementations = (await files(path.join(root, "modules"))).filter(file => path.basename(file).startsWith("drizzle."));
  assert.equal(implementations.length, 12);
  for (const file of implementations) {
    const source = await readFile(file, "utf8");
    assert.match(source, /implements I\w+Repository/);
    assert.doesNotMatch(source, /DatabaseSession =|new \w+Repository\(\)/);
    await readFile(file.replace("drizzle.", ""), "utf8");
  }
});

test("migration journal is complete, ordered, and backed by committed SQL", async () => {
  const folder = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const journal = JSON.parse(await readFile(path.join(folder, "meta", "_journal.json"), "utf8"));
  let previous = -1;
  for (const [index, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, index);
    assert.ok(entry.when > previous);
    previous = entry.when;
    assert.ok((await readFile(path.join(folder, `${entry.tag}.sql`), "utf8")).trim());
  }
});
