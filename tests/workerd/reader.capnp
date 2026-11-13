using Workerd = import "/workerd/workerd.capnp";

# Run from the repository root: workerd test -I. tests/workerd/reader.capnp
const config :Workerd.Config = (
  services = [(name = "reader", worker = (
    compatibilityDate = "2026-08-26",
    modules = [
      (name = "reader-test.js", esModule = embed "reader-test.js"),
      (name = "lib/audit.js", esModule = embed "/lib/audit.js"),
      (name = "lib/analyze.js", esModule = embed "/lib/analyze.js"),
      (name = "lib/lexicon.js", esModule = embed "/lib/lexicon.js"),
      (name = "lib/guard.js", esModule = embed "/lib/guard.js"),
      (name = "lib/bounded-fetch.js", esModule = embed "/lib/bounded-fetch.js"),
      (name = "lib/html-scan.js", esModule = embed "/lib/html-scan.js"),
      (name = "lib/ld-read.js", esModule = embed "/lib/ld-read.js"),
      (name = "lib/vendor-products.js", esModule = embed "/lib/vendor-products.js"),
      (name = "lib/event.js", esModule = embed "/lib/event.js"),
      (name = "lib/link.js", esModule = embed "/lib/link.js"),
      (name = "lib/headers.js", esModule = embed "/lib/headers.js"),
      (name = "lib/seal.js", esModule = embed "/lib/seal.js"),
      (name = "lib/identity.js", esModule = embed "/lib/identity.js"),
      (name = "public/assets/question-bank.js", esModule = embed "/public/assets/question-bank.js"),
    ]
  ))]
);
