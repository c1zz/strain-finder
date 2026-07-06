import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { EFFECTS, recommendStrains, streamChat } from "./claude.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "100kb" }));

app.get("/api/effects", (_req, res) => {
  res.json({ effects: EFFECTS });
});

app.post("/api/recommend", async (req, res) => {
  const { effects } = req.body ?? {};
  if (
    !Array.isArray(effects) ||
    effects.length === 0 ||
    !effects.every((e) => EFFECTS.includes(e))
  ) {
    return res.status(400).json({ error: "effects must be a non-empty subset of /api/effects" });
  }

  try {
    const strains = await recommendStrains(effects);
    res.json({ strains });
  } catch (err) {
    console.error("recommend failed:", err);
    res.status(502).json({ error: "Empfehlung fehlgeschlagen, bitte erneut versuchen." });
  }
});

const MAX_HISTORY = 20;

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= MAX_HISTORY &&
    messages.every(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 4000
    );
  if (!valid) {
    return res.status(400).json({ error: "invalid messages array" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const stream = streamChat(messages);
  // res "close" fires when the client disconnects (req "close" would fire as
  // soon as the request body is consumed). Guard so a normal end is a no-op.
  res.on("close", () => {
    if (!res.writableFinished) stream.abort();
  });

  stream.on("text", (delta) => {
    res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
  });

  try {
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      res.write(`data: ${JSON.stringify({ error: "Anfrage wurde abgelehnt." })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
  } catch (err) {
    if (!(err instanceof Anthropic.APIUserAbortError)) {
      console.error("chat stream failed:", err);
      res.write(`data: ${JSON.stringify({ error: "Chat fehlgeschlagen." })}\n\n`);
    }
  } finally {
    res.end();
  }
});

// Serve the built SPA when client/dist exists (single-process deployment).
const dist = path.resolve(here, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`strain-finder server listening on http://localhost:${port}`);
});
