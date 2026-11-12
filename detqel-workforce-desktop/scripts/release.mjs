// Builds a signed release: the installer and its .sig file, ready to publish on the License Portal's
// Updates page. Usage: npm run build:release
//
// Signing uses the product's updater private key, which never leaves this machine:
//   TAURI_SIGNING_PRIVATE_KEY           key path or contents (default ~/.tauri/<product>-updater.key)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password (default: read from ~/.tauri/<product>-updater.password)
//   DETQEL_UPDATE_SERVER_URL            License Portal API the app checks (default http://127.0.0.1:3012)
//   DETQEL_LICENSE_PORTAL_PRODUCT_KEY   product key embedded for sign-in (default: LICENSE_PORTAL_PRODUCT_KEY in backend/.env)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const PRODUCT = "kin";
const PRODUCT_KEY_PATTERN = /^dpk_[A-Za-z0-9_-]{43}$/;
const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!npmCli) fail("Run this script with npm run build:release.");

const config = JSON.parse(readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const { version, productName } = config;
const keyDirectory = path.join(homedir(), ".tauri");
const keyPath = path.join(keyDirectory, `${PRODUCT}-updater.key`);
const passwordPath = path.join(keyDirectory, `${PRODUCT}-updater.password`);

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  if (!existsSync(keyPath)) fail(`No updater signing key. Expected ${keyPath} or TAURI_SIGNING_PRIVATE_KEY.`);
  // Signing with another product's key would produce builds this app refuses to install.
  const publicKey = `${keyPath}.pub`;
  if (existsSync(publicKey) && readFileSync(publicKey, "utf8").trim() !== config.plugins?.updater?.pubkey)
    fail(`${publicKey} does not match plugins.updater.pubkey in tauri.conf.json.`);
  env.TAURI_SIGNING_PRIVATE_KEY = keyPath;
}
if (!env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  if (!existsSync(passwordPath))
    fail("Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD to the updater key's password.");
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(passwordPath, "utf8").trim();
}

// Installed copies cannot sign in without the portal-issued product key, so the release embeds it.
const developmentEnv = path.join(root, "backend/.env");
let productKeySource = "DETQEL_LICENSE_PORTAL_PRODUCT_KEY";
if (!env.DETQEL_LICENSE_PORTAL_PRODUCT_KEY && existsSync(developmentEnv)) {
  env.DETQEL_LICENSE_PORTAL_PRODUCT_KEY = parseEnv(readFileSync(developmentEnv, "utf8")).LICENSE_PORTAL_PRODUCT_KEY;
  productKeySource = developmentEnv;
}
if (!PRODUCT_KEY_PATTERN.test(env.DETQEL_LICENSE_PORTAL_PRODUCT_KEY ?? ""))
  fail(`No valid License Portal product key. Set DETQEL_LICENSE_PORTAL_PRODUCT_KEY (issued with npm run product:key -- --product ${PRODUCT}) or LICENSE_PORTAL_PRODUCT_KEY in ${developmentEnv}.`);

const server = env.DETQEL_UPDATE_SERVER_URL ?? "http://127.0.0.1:3012";
console.log(`Building ${productName} ${version}; installed copies will check ${server} for updates.`);
console.log(`Embedding the License Portal product key from ${productKeySource}.`);
// A version bump changes only this crate's own entry in Cargo.lock; sync it so --locked still pins every dependency.
const lock = spawnSync("cargo", ["update", "--workspace", "--offline"], { cwd: path.join(root, "src-tauri"), stdio: "inherit" });
if (lock.status !== 0) fail("Cargo.lock could not be synced with the crate version.");
const build = spawnSync(process.execPath, [npmCli, "run", "tauri", "--", "build", "--", "--locked"], {
  cwd: root,
  env,
  stdio: "inherit",
});
if (build.status !== 0) fail(`The build failed (exit code ${build.status ?? "unknown"}).`);

const bundles = path.join(root, "src-tauri/target/release/bundle");
const artifacts = [];
for (const kind of existsSync(bundles) ? readdirSync(bundles) : []) {
  for (const name of readdirSync(path.join(bundles, kind)))
    if (name.endsWith(".sig") && name.includes(version)) {
      const installer = path.join(bundles, kind, name.slice(0, -".sig".length));
      if (existsSync(installer)) artifacts.push(installer);
    }
}
if (!artifacts.length) fail("The build produced no signed installer. Check bundle.createUpdaterArtifacts.");
console.log(`\nPublish these on the License Portal (Updates > Publish release), version ${version}:`);
for (const installer of artifacts) console.log(`  ${installer}\n  ${installer}.sig`);
