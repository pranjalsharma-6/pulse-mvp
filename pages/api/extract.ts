// pages/api/extract.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Task = { title: string; assignee?: string; due?: string; priority?: string };
type ResponseBody = { tasks: Task[]; followUp: string };

const USE_OPENAI = process.env.USE_OPENAI === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/**
 * Clean up punctuation, whitespace and repeated periods.
 */
function tidy(text: string) {
  return text
    .replace(/\s+([.,;:!?])/g, "$1") // remove space before punctuation
    .replace(/([.]){2,}/g, ".") // collapse repeated periods
    .replace(/\s{2,}/g, " ") // collapse multiple spaces
    .trim();
}

/**
 * If you enable OpenAI mode, this function calls the Chat Completions API
 * and asks the model to return strict JSON. Keep temperature low (0.0)
 * for deterministic output.
 *
 * NOTE: You must set USE_OPENAI=true and OPENAI_API_KEY in .env.local to use this.
 */
async function callOpenAIExtract(text: string): Promise<ResponseBody> {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not set");

  const prompt = `You are a JSON extractor. Given meeting notes, return ONLY valid JSON with this shape:
{"tasks":[{"title":"...","assignee":"...","due":"...","priority":"..."}],"followUp":"..."}
Extract tasks (short title), suggest a likely assignee if present, suggest a due date if present or plausible, and write a concise follow-up (1-2 sentences). Return only valid JSON.

Notes:
${text}
`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // change if needed for your account
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      max_tokens: 600,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  // The model should return raw JSON. Try to parse directly, otherwise
  // attempt to extract the first JSON block from the response.
  try {
    const parsed = JSON.parse(content);
    return { tasks: parsed.tasks ?? [], followUp: tidy(parsed.followUp ?? "") };
  } catch {
    // Attempt to extract JSON substring
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return { tasks: parsed.tasks ?? [], followUp: tidy(parsed.followUp ?? "") };
      } catch (e) {
        // fall through to fallback
      }
    }
    throw new Error("OpenAI response could not be parsed as JSON");
  }
}

/**
 * Deterministic mock parser: simple heuristics to find action lines.
 * Works offline and is suitable for the submission/demo.
 */
function mockExtract(text: string): ResponseBody {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const tasks: Task[] = [];

  for (const line of lines) {
    // Heuristics: lines that start with '-' or '*' or contain common action words.
    if (/^[-*]\s*/.test(line) || /\b(action|action:|please|will|assign|assigned|due|deliver|todo)\b/i.test(line)) {
      const cleaned = line.replace(/^[-*]\s*/g, "");
      // Try to detect a name as assignee: a capitalized word (simple heuristic)
      const assigneeMatch = cleaned.match(/\b(?:assigned to|assign to|by)\s+([A-Z][a-zA-Z]+)/i)
        || cleaned.match(/\b([A-Z][a-z]{2,})\b/); // fallback: first capitalized word
      const assignee = assigneeMatch ? assigneeMatch[1] : undefined;

      // Try to extract a date phrase (very naive)
      const dueMatch = cleaned.match(/\b(by|before|on|due)\s+([A-Za-z0-9 ,.-]+)/i);
      const due = dueMatch ? dueMatch[2] : undefined;

      // Shorten title if very long
      const title = cleaned.length > 250 ? cleaned.slice(0, 247) + "..." : cleaned;

      tasks.push({ title, assignee, due });
    }
  }

  if (tasks.length === 0) {
    tasks.push({ title: "Review meeting notes and propose next steps" });
  }

  let followUp = `Thanks everyone for the meeting. Next actions: ${tasks.map((t) => t.title).join("; ")}. Please confirm owners and timelines.`;
  followUp = tidy(followUp);

  return { tasks, followUp };
}

/**
 * API handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { text
