import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getPosition(segment = {}) {
  return segment.positionTitle === "Other" ? segment.customPositionTitle : segment.positionTitle;
}

function getExperienceLevel(position) {
  const t = String(position || "").toLowerCase();
  if (t.includes("apprentice")) return "apprentice";
  if (t.includes("foreman") || t.includes("lead") || t.includes("supervisor")) return "leadership";
  if (t.includes("manager") || t.includes("master")) return "management";
  if (t.includes("technician") || t.includes("controls") || t.includes("solar")) return "specialized";
  return "journeyman";
}

function buildPrompt({ writingType, outputMode, segments = [], letterFields = {}, prompt }) {
  if (prompt) return prompt;

  const mode = writingType || outputMode || "application";

  const modeInstructions = {
    application:
      "Write first-person experience descriptions for a licensing application. Use I language. Focus on hands-on work personally performed, scope of work, environments, systems, and growth in responsibility.",
    verified:
      "Write third-person verified experience descriptions as if a supervisor or employer is confirming the applicant's duties. Use factual, professional language and avoid exaggeration.",
    letter:
      "Write a formal employer verification letter. Use a professional business tone, include verification of work history, describe duties clearly, and make it suitable for letterhead and signature.",
    summary:
      "Write a clear professional summary of electrical experience. Use a balanced tone that is useful for applications, discussions, or general documentation.",
    resume:
      "Write a concise resume-style experience description. Use short, direct language focused on responsibilities, work types, and key capabilities."
  };

  const rules = [
    modeInstructions[mode] || modeInstructions.application,
    "Do not mention NEC chapters or NEC articles.",
    "Do not invent licenses, certifications, hours, or responsibilities that were not provided.",
    "Use the selected work types and work examples as the basis for the description.",
    "Write naturally and credibly, as if describing real electrical experience.",
    "Each company/year segment should remain separate unless the selected format requires a combined letter."
  ];

  const letterHeader =
    mode === "letter"
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
      const position = getPosition(segment);
      const level = getExperienceLevel(position);
      const map = segment.workExamplesByWorkType || {};
      const workTypeLines = (segment.workTypes || [])
        .map(type => `${type}: ${(map[type] || []).join(", ") || "[none selected]"}`)
        .join("\n");

      return [
        `Segment ${index + 1}`,
        `Company: ${segment.company || "[not provided]"}`,
        `Years employed: ${segment.years || "[not provided]"}`,
        `Position/title: ${position || "[not provided]"}`,
        `Experience level cue from title: ${level}`,
        `Work types: ${(segment.workTypes || []).join(", ") || "[not provided]"}`,
        workTypeLines,
        `Other tasks: ${segment.otherTasks || "None"}`,
        `Other systems: ${segment.otherSystems || "None"}`
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [...rules, letterHeader, segmentText].filter(Boolean).join("\n\n");
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
