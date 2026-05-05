import OpenAI from "openai";
import { Document, Packer, Paragraph, TextRun } from "docx";

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

function buildLetterPrompt({ segments = [], letterFields = {} }) {
  const header = [
    "Write a formal employer verification letter.",
    "The letter should sound like it is written by the employer or supervisor.",
    "Do not mention NEC chapters or NEC articles.",
    "Use a professional business tone and keep the experience credible and specific.",
    "Do not invent licenses, certifications, hours, or responsibilities that were not provided.",
    `Applicant name: ${letterFields.applicantName || "[not provided]"}`,
    `Verifier name: ${letterFields.verifierName || "[not provided]"}`,
    `Verifier title: ${letterFields.verifierTitle || "[not provided]"}`,
    `Company name: ${letterFields.companyName || "[not provided]"}`,
    `Company address: ${letterFields.companyAddress || "[not provided]"}`,
    `Date: ${letterFields.date || "[not provided]"}`,
    `Salutation: ${letterFields.salutation || "To Whom It May Concern"}`
  ].join("\n");

  const segs = segments
    .map((segment, index) => {
      const map = segment.workExamplesByWorkType || {};
      const workTypeLines = (segment.workTypes || [])
        .map(type => `${type}: ${(map[type] || []).join(", ") || "[none selected]"}`)
        .join("\n");

      return [
        `Segment ${index + 1}`,
        `Company: ${segment.company || "[not provided]"}`,
        `Years employed: ${segment.years || "[not provided]"}`,
        `Position/title: ${getPosition(segment) || "[not provided]"}`,
        `Work types: ${(segment.workTypes || []).join(", ") || "[not provided]"}`,
        workTypeLines,
        `Other tasks: ${segment.otherTasks || "None"}`,
        `Other systems: ${segment.otherSystems || "None"}`
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return [header, segs].join("\n\n");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const response = await client.responses.create({
      model: "gpt-5.4",
      input: buildLetterPrompt(body)
    });

    const letterText = response.output_text || "";
    const letterFields = body.letterFields || {};

    const paragraphs = letterText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => new Paragraph({ children: [new TextRun(p)] }));

    const doc = new Document({
      sections: [{
        children: [
          ...(letterFields.companyName ? [new Paragraph({ children: [new TextRun({ text: letterFields.companyName, bold: true })] })] : []),
          ...(letterFields.companyAddress ? String(letterFields.companyAddress).split(/\n/).map(line => new Paragraph(line)) : []),
          ...(letterFields.date ? [new Paragraph(""), new Paragraph(letterFields.date)] : []),
          new Paragraph(""),
          new Paragraph(letterFields.salutation || "To Whom It May Concern"),
          new Paragraph(""),
          ...paragraphs,
          new Paragraph(""),
          new Paragraph("Sincerely,"),
          new Paragraph(""),
          new Paragraph(letterFields.verifierName || ""),
          new Paragraph(letterFields.verifierTitle || "")
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=employment-verification-letter.docx");
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error" });
  }
}
