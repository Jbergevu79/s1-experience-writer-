import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function buildPrompt({ outputMode, segments = [], letterFields = {}, prompt }) {
  if (prompt) return prompt;

  const intro =
    outputMode === "applicant"
      ? "Write first-person electrician narratives. Write one paragraph per company/year segment in the electrician's own voice."
      : outputMode === "verifier"
      ? "Write third-person verifier narratives. Write one paragraph per company/year segment in the verifier's voice."
      : "Write a formal employer verification letter that uses the employer or supervisor voice, with a date line, salutation, body paragraphs, and closing.";

  const rules = [
    "Do not mention NEC chapters or NEC articles in the final writing.",
    "Use the selected work environments and work examples as guidance for the substance of the work.",
    "Write naturally and credibly, as if describing real electrical experience."
  ];

  const letterHeader =
    outputMode === "letter"
      ? [
          `Applicant name: ${letterFields.applicantName || "[not provided]"}`,
          `Verifier name: ${letterFields.verifierName || "[not provided]"}`,
          `Verifier title: ${letterFields.verifierTitle || "[not provided]"}`,
          `Company name: ${letterFields.companyName || "[not provided]"}`,
          `Company address: ${letterFields.companyAddress || "[not provided]"}`,
          `Date: ${letterFields.date || "[not provided]"}`,
          `Salutation: ${letterFields.salutation || "To Whom It May Concern"}`
        ].join("\n")
      : "";

  const segmentText = segments
    .map((segment, index) => {
      const envMap = segment.workTypesByEnvironment || {};
      const envLines = (segment.workEnvironments || [])
        .map(env => `${env}: ${(envMap[env] || []).join(", ") || "[none selected]"}`)
        .join("\n");

      return [
        `Segment ${index + 1}`,
        `Company: ${segment.company || "[not provided]"}`,
        `Years: ${segment.years || "[not provided]"}`,
        `Work environments: ${(segment.workEnvironments || []).join(", ") || "[not provided]"}`,
        envLines,
        `Other tasks: ${segment.otherTasks || "None"}`,
        `Other systems: ${segment.otherSystems || "None"}`
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [intro, ...rules, letterHeader, segmentText].filter(Boolean).join("\n\n");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const response = await client.responses.create({
      model: "gpt-5.4",
      input: buildPrompt(body)
    });

    return res.status(200).json({ output: response.output_text });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error" });
  }
}

