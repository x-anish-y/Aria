import fs from "node:fs";

const html = await (await fetch("http://localhost:3000/")).text();
const match = html.match(/href="([^"]+\.css)"/);
if (match) {
  const css = await (await fetch("http://localhost:3000" + match[1])).text();
  console.log("Has grid-cols-12:", css.includes("grid-cols-12"));
  console.log("Has col-span-7:", css.includes("col-span-7"));
  console.log("Has col-span-5:", css.includes("col-span-5"));
  console.log("Has grid-cols-5:", css.includes("grid-cols-5"));
  console.log("Has col-span-3:", css.includes("col-span-3"));
}
