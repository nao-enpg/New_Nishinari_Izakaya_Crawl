// prisma CLI と @prisma/client / @prisma/adapter-d1 の版が一致していることを確かめる。
// （@prisma/client の peer は "prisma": "*" なので、ずれても警告が出ない）
import { readFileSync } from "node:fs";
/** @param {string} name */
const ver = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
const versions = Object.fromEntries(["prisma", "@prisma/client", "@prisma/adapter-d1"].map((n) => [n, ver(n)]));
const unique = new Set(Object.values(versions));
console.log(versions);
if (unique.size !== 1) { console.error("Prisma パッケージの版が一致していません"); process.exit(1); }
