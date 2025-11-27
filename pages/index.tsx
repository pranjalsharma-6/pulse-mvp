// pages/index.tsx
import { useState } from "react";

type Task = { title: string; assignee?: string; due?: string; priority?: string };

const SAMPLE = `- Action: Integrate payments API by next Wednesday. Assigned to Ravi.
- Please prepare the onboarding doc by Friday. Alice will lead.
We will discuss metrics next meeting. John will propose KPIs.`;

function cleanFollowUp(text: string) {
  // basic cleanup: remove duplicated punctuation and trim
  return text
    .replace(/\s+([.,;:!?])/g, "$1")         // remove space before punctuation
    .replace(/([.]){2,}/g, ".")              // collapse repeated periods
    .replace(/\s{2,}/g, " ")                 // collapse multiple spaces
    .trim();
}

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ tasks: Task[]; followUp: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze(text?: string) {
    const payloadText = text ?? input;
    if (!payloadText) return;
    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payloadText }),
      });
      const data = await res.json();
      // run client-side cleanup of followUp
      if (data?.followUp) data.followUp = cleanFollowUp(data.followUp);
      setResult(data);
    } catch (err) {
      alert("Error: " + (err as any).toString());
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 28, fontFamily: "Inter, Arial, sans-serif", maxWidth: 980, margin: "0 auto", color: "#111" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Smart Action Extractor (MVP)</h1>
      <p style={{ marginTop: 0, color: "#444" }}>Paste meeting notes or an email. Click <strong>Analyze</strong> to extract tasks and a follow-up.</p>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => handleAnalyze(SAMPLE)}
          style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
        >
          Use sample notes
        </button>

        <button
          onClick={() => {
            setInput(SAMPLE);
            setResult(null);
          }}
          style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
        >
          Fill textarea with sample
        </button>
      </div>

      <textarea
        placeholder="Paste meeting notes or email here..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        style={{
          width: "100%",
          fontSize: 14,
          padding: 12,
          borderRadius: 8,
          marginTop: 12,
          boxSizing: "border-box",
          background: "#fff",
          border: "1px solid #e6e6e6",
        }}
      />

      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => handleAnalyze()}
          disabled={loading || !input}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            cursor: loading || !input ? "not-allowed" : "pointer",
            background: "#0b5cff",
            color: "white",
            border: "none",
          }}
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {result && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 18 }}>Extracted Tasks</h2>
          <ul>
            {result.tasks.map((t, i) => (
              <li key={i} style={{ marginBottom: 8, lineHeight: 1.4 }}>
                <strong>{t.title}</strong>
                {t.assignee ? ` — ${t.assignee}` : ""} {t.due ? ` — due ${t.due}` : ""} {t.priority ? ` — ${t.priority}` : ""}
              </li>
            ))}
          </ul>

          <h3 style={{ fontSize: 16, marginTop: 12 }}>Suggested Follow-up</h3>
          <div style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #e6e6e6", borderRadius: 8, background: "#fff" }}>
            {result.followUp}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              onClick={() => navigator.clipboard.writeText(result.followUp)}
              style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Copy follow-up
            </button>
            <button
              onClick={() => {
                // create a mailto with follow-up in body
                const subject = encodeURIComponent("Meeting follow-up / next actions");
                const body = encodeURIComponent(result.followUp);
                window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
              }}
              style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Open email draft
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
