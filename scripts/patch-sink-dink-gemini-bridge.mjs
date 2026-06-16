import { readFileSync, writeFileSync } from "node:fs";

const appPath = "server/src/app.ts";
let source = readFileSync(appPath, "utf8");

const importLine = 'import { sinkDinkGeminiBridgeRoutes } from "./routes/sink-dink-gemini-bridge.js";';
if (!source.includes(importLine)) {
  source = source.replace(
    'import { COMPANY_IMPORT_API_PATH } from "./routes/company-import-paths.js";\n',
    'import { COMPANY_IMPORT_API_PATH } from "./routes/company-import-paths.js";\n' + importLine + "\n",
  );
}

const routeLine = "  api.use(sinkDinkGeminiBridgeRoutes());";
if (!source.includes(routeLine)) {
  source = source.replace(
    "  api.use(openApiRoutes());\n",
    "  api.use(openApiRoutes());\n" + routeLine + "\n",
  );
}

writeFileSync(appPath, source);
console.log("[patch-sink-dink-gemini-bridge] route mounted");
