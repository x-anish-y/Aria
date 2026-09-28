/**
 * scripts/eval-layout.mjs
 */
const html = await (await fetch("http://localhost:3000/")).text();
// Let's check where the right section is placed
console.log("HTML has TestOrdersPanel:", html.includes("Interactive Test Catalog"));

// Check if section with lg:col-span-5 is in HTML
console.log("HTML has lg:col-span-5:", html.includes("lg:col-span-5"));
console.log("HTML has lg:col-span-7:", html.includes("lg:col-span-7"));
console.log("HTML has lg:grid-cols-12:", html.includes("lg:grid-cols-12"));
