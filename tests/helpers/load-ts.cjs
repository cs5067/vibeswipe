/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");

// Exercise the real TypeScript modules without loading native Expo bindings
// or contacting providers. Unexpected dependencies fail instead of being mocked silently.
function loadTs(relative, dependencies = {}, globals = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(source, {
    module: loadedModule,
    exports: loadedModule.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected import in ${relative}: ${name}`);
    },
    console: { log() {}, error() {}, warn() {} },
    Date, Error, Set, Map, Buffer, URL, URLSearchParams, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    process: { env: {} },
    ...globals,
  }, { filename });
  return loadedModule.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

module.exports = { loadTs, deferred };
