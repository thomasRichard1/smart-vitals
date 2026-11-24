import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../client/dist");
const port = process.env.PORT || 3000;

const app = express();
app.disable("x-powered-by");

// Basic hardening headers; the app only talks to the FHIR server named by the launch.
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(express.static(dist));
// SPA fallback: /launch (SMART launch URL) and / (redirect URI) both load the app.
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(port, () => console.log(`SMART Vitals listening on http://localhost:${port}`));
