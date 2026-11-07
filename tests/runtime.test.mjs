import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getQuickJS } from "quickjs-emscripten";
import { encryptedURL } from "./helpers.mjs";

test("the distributed module and AES decoder run in QuickJS without Node globals", async () => {
  const engine = await getQuickJS();
  const vm = engine.newContext();
  vm.runtime.setMemoryLimit(64 * 1024 * 1024);
  vm.runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + 3000;
  vm.runtime.setInterruptHandler(() => Date.now() > deadline);
  try {
    // MyGo supplies URL via moejs/webapi. Only that Web API is bridged here;
    // module initialization and AES execute in QuickJS, without Buffer/crypto.
    const parseURL = vm.newFunction("parseURL", (value) => {
      const url = new URL(vm.getString(value));
      return vm.newString(JSON.stringify({ protocol: url.protocol, hostname: url.hostname, port: url.port, username: url.username, password: url.password, pathname: url.pathname, href: url.href }));
    });
    vm.setProp(vm.global, "__parseURL", parseURL);
    parseURL.dispose();
    vm.unwrapResult(vm.evalCode(`
      globalThis.URL = class URL {
        constructor(input) { Object.assign(this, JSON.parse(__parseURL(input))); }
        toString() { return this.href; }
      };
    `)).dispose();
    const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
    const exports = vm.unwrapResult(vm.evalCode(source + "\nexport { decodePlayURL as __testDecode };", "index.js", { type: "module" }));
    vm.setProp(vm.global, "plugin", exports);
    exports.dispose();
    vm.unwrapResult(vm.evalCode(`globalThis.host = { storage: { get() { return null; } } };`)).dispose();
    const exported = vm.unwrapResult(vm.evalCode("typeof plugin.recent"));
    assert.equal(vm.getString(exported), "function");
    exported.dispose();
    const url = "https://audio.xmcdn.com/quickjs.m4a?test=synthetic";
    const decoded = vm.unwrapResult(vm.evalCode(`plugin.__testDecode(${JSON.stringify(encryptedURL(url))})`));
    assert.equal(vm.getString(decoded), url);
    decoded.dispose();
  } finally { vm.dispose(); }
});
