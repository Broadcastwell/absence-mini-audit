import "./lib/audit.js";
import { readPage } from "./lib/analyze.js";

export default {
  async test() {
    const base = "https://fixture.example.org/";
    const first = '<a href="/about">About</a><a href="/company">Company</a>';
    const bad = '<a href="//[">';
    const count = Math.floor((1024 * 1024 - first.length) / bad.length);
    const html = first + bad.repeat(count);
    // workerd advances its clock after I/O. Yield on both sides of the synchronous read.
    await scheduler.wait(1);
    const started = Date.now();
    const page = readPage(html, base);
    await scheduler.wait(1);
    const elapsed = Date.now() - started;
    console.log(`Read ${count} malformed links and two good links in ${elapsed} ms.`);
    if (page.links.join(",") !== base + "about," + base + "company") throw Error("Useful links changed");
    if (elapsed >= 500) throw Error(`Malformed links took ${elapsed} ms (limit 500 ms)`);
  },
};
