// Production entrypoint. `npm run dev` is the development path; this script
// defaults to production mode and loads .env when present.
process.env.NODE_ENV ??= "production";
await import("../src/server/index.ts");
