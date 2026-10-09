const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const target = path.resolve(root, "dist");
if (target !== path.join(root, "dist") || !target.startsWith(root + path.sep)) throw new Error("Unsafe build directory");
fs.rmSync(target, { recursive: true, force: true });
