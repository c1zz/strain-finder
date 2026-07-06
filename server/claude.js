import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = path.dirname(fileURLToPath(import.meta.url));

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

// The API key is resolved from ANTHROPIC_API_KEY — it never leaves the server.
const client = new Anthropic();

// The raw JSON string is what Claude sees (kept byte-identical across requests
// so the prompt cache can do its job). The parsed map is used to verify that
// every recommended product actually exists before it reaches the client —
// the model picks from the dataset, it never invents URLs.
const terpeneJson = fs.readFileSync(
  path.join(here, "data", "terpenes.json"),
  "utf8"
);
const products = JSON.parse(terpeneJson).filter((p) => p.u);
const productsByUrl = new Map(products.map((p) => [p.u, p]));

// Single source of truth for selectable effects; the client fetches this list.
export const EFFECTS = [
  "anregend",
  "beruhigend",
  "entspannend",
  "schlaffördernd",
  "angstlösend",
  "stimmungsaufhellend",
  "antidepressiv",
  "schmerzlindernd",
  "entzündungshemmend",
  "krampflösend",
  "muskelentspannend",
  "appetitanregend",
  "fokusfördernd",
  "energiesteigernd",
  "übelkeitslindernd",
  "kreativitätsfördernd",
];

// Keep the model's output minimal — it only picks and explains. Name and
// terpene list are enriched server-side from the dataset, which roughly
// halves the output tokens (the dominant latency factor) and guarantees
// the displayed data matches the dataset exactly.
const RecommendationSchema = z.object({
  strains: z
    .array(
      z.object({
        url: z.string().describe("Product URL exactly as in the dataset"),
        reason: z
          .string()
          .describe(
            "One short German sentence: why this strain matches the requested effects"
          ),
      })
    )
    .describe("Exactly 5 recommended strains, best match first"),
});

// Shared by real requests and the warm-up: a structured-outputs request has a
// different cacheable prefix than a plain one, so the warm-up must send the
// exact same format or the cache misses.
const RECOMMENDATION_FORMAT = zodOutputFormat(RecommendationSchema);

const RECOMMEND_SYSTEM = `Du bist ein fachkundiger Assistent für medizinisches Cannabis.
Du erhältst eine Produktdatenbank (JSON) mit Terpen-Profilen. Feldkürzel:
"t" = Produktname, "u" = Produkt-URL, "d" = Terpene mit "t" (Name), "o" (Vorkommen), "s" (Aroma), "e" (Effekte).

Regeln:
- Empfiehl ausschließlich Produkte aus der Datenbank. Übernimm "url" exakt.
- Wähle genau 5 Produkte, deren Terpen-Effekte am besten zu den angefragten Effekten passen.
- Sorge für Vielfalt: Empfiehl nicht nur Produkte mit identischem Terpen-Profil.
- Begründungen: je ein kurzer deutscher Satz.`;

// System blocks are shared between real requests and the cache warm-up —
// they must stay byte-identical or the prompt cache misses.
const RECOMMEND_SYSTEM_BLOCKS = [
  { type: "text", text: RECOMMEND_SYSTEM },
  {
    type: "text",
    text: `Produktdatenbank:\n${terpeneJson}`,
    // Static ~50K-token prefix — cached across requests (~90% cheaper reads).
    cache_control: { type: "ephemeral" },
  },
];

export async function recommendStrains(effects) {
  const started = Date.now();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    system: RECOMMEND_SYSTEM_BLOCKS,
    messages: [
      {
        role: "user",
        content: `Gewünschte Effekte: ${effects.join(", ")}. Empfiehl passende Sorten.`,
      },
    ],
    output_config: { format: RECOMMENDATION_FORMAT },
  });

  const u = response.usage;
  console.log(
    `recommend: ${Date.now() - started}ms | input ${u.input_tokens} | ` +
      `cache write ${u.cache_creation_input_tokens} | cache read ${u.cache_read_input_tokens} | ` +
      `output ${u.output_tokens}`
  );

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Model returned no usable recommendation");
  }

  // Verify against the dataset (drops hallucinated URLs) and enrich with the
  // authoritative product data instead of having the model repeat it.
  return response.parsed_output.strains
    .filter((s) => productsByUrl.has(s.url))
    .map((s) => {
      const product = productsByUrl.get(s.url);
      return {
        name: product.t,
        url: s.url,
        terpenes: (product.d ?? []).map((d) => d.t),
        reason: s.reason,
      };
    });
}

// Pre-warm the prompt cache so the first real request doesn't pay the cold
// read of the ~50K-token dataset. max_tokens: 0 would be ideal (prefill only)
// but is rejected together with structured outputs, so generate a token-scrap
// and discard it — the cache write is what matters.
export async function warmCache() {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8,
    system: RECOMMEND_SYSTEM_BLOCKS,
    messages: [{ role: "user", content: "warmup" }],
    output_config: { format: RECOMMENDATION_FORMAT },
  });
  const u = response.usage;
  console.log(
    `cache warm-up: write ${u.cache_creation_input_tokens} | read ${u.cache_read_input_tokens}`
  );
}

const CHAT_SYSTEM = `Du bist ein freundlicher Assistent mit fundiertem Wissen über medizinisches Cannabis,
Terpene und deren Wirkungen. Antworte auf Deutsch, präzise und gut lesbar.
Antworte in Fließtext ohne Markdown-Formatierung (keine Überschriften, keine
Sternchen) — die Ausgabe wird als reiner Text angezeigt.
Gib keine individuellen medizinischen Ratschläge — verweise bei Dosierungs- und
Therapiefragen an Ärztin/Arzt oder Apotheke. Bleib beim Thema Cannabis/Terpene;
lehne fachfremde Fragen höflich ab.`;

export function streamChat(messages) {
  return client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: CHAT_SYSTEM,
    messages,
  });
}
