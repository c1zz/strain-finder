import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = path.dirname(fileURLToPath(import.meta.url));

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

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

const RecommendationSchema = z.object({
  strains: z
    .array(
      z.object({
        name: z.string().describe("Product name exactly as in the dataset"),
        url: z.string().describe("Product URL exactly as in the dataset"),
        terpenes: z
          .array(z.string())
          .describe("Terpenes of this product that drive the requested effects"),
        reason: z
          .string()
          .describe(
            "One or two German sentences explaining why this strain matches the requested effects"
          ),
      })
    )
    .describe("5 to 8 recommended strains, best match first"),
});

const RECOMMEND_SYSTEM = `Du bist ein fachkundiger Assistent für medizinisches Cannabis.
Du erhältst eine Produktdatenbank (JSON) mit Terpen-Profilen. Feldkürzel:
"t" = Produktname, "u" = Produkt-URL, "d" = Terpene mit "t" (Name), "o" (Vorkommen), "s" (Aroma), "e" (Effekte).

Regeln:
- Empfiehl ausschließlich Produkte aus der Datenbank. Übernimm "name" und "url" exakt.
- Wähle Produkte, deren Terpen-Effekte am besten zu den angefragten Effekten passen.
- Sorge für Vielfalt: Empfiehl nicht nur Produkte mit identischem Terpen-Profil.
- Antworte auf Deutsch.`;

export async function recommendStrains(effects) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: RECOMMEND_SYSTEM },
      {
        type: "text",
        text: `Produktdatenbank:\n${terpeneJson}`,
        // Static ~40K-token prefix — cached across requests (~90% cheaper reads).
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Gewünschte Effekte: ${effects.join(", ")}. Empfiehl passende Sorten.`,
      },
    ],
    output_config: { format: zodOutputFormat(RecommendationSchema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Model returned no usable recommendation");
  }

  // Defense in depth: drop anything not present in the dataset.
  return response.parsed_output.strains.filter((s) => productsByUrl.has(s.url));
}

const CHAT_SYSTEM = `Du bist ein freundlicher Assistent mit fundiertem Wissen über medizinisches Cannabis,
Terpene und deren Wirkungen. Antworte auf Deutsch, präzise und gut lesbar.
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
