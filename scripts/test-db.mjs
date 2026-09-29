import { neon } from "@neondatabase/serverless";
import fs from "fs";

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const env = fs.readFileSync(".env.local", "utf8");
    const m = env.match(/DATABASE_URL=([^\r\n]+)/);
    if (m) dbUrl = m[1].trim();
  } catch {}
}

try {
  const sql = neon(dbUrl);
  const cols = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'orders'
  `;
  console.log("Columns in 'orders':", cols.map(c => c.column_name));
} catch (err) {
  console.error("FAILURE:", err.message);
}
