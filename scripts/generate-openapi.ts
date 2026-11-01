import { writeFileSync } from "node:fs";
import { openapi } from "../services/api/src/openapi.js";
writeFileSync("docs/openapi.json", JSON.stringify(openapi, null, 2) + "\n");
console.log("Generated docs/openapi.json");
