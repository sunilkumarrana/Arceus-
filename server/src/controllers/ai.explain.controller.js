import { findSchemeById, saveSchemeAiSummary } from "../../../src/db/schemes.ts";
import { generateGeminiJson, Type } from "../services/gemini.service.js";

const explainSchema = {
  type: Type.OBJECT,
  properties: {
    overview: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    benefits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    eligibility: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    applicationProcess: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["overview", "benefits", "eligibility", "applicationProcess"],
};

export const aiExplainController = async (req, res) => {
  const { schemeId } = req.body;
  if (!schemeId) {
    return res.status(400).json({ success: false, message: "schemeId is required" });
  }

  try {
    const scheme = await findSchemeById(String(schemeId));
    if (!scheme) {
      return res.status(404).json({ success: false, message: "Scheme not found" });
    }

    if (scheme.ai_summary) {
      return res.status(200).json({
        success: true,
        schemeId: scheme._id,
        schemeName: scheme.scheme_name,
        summary: scheme.ai_summary,
      });
    }

    const summary = await generateGeminiJson({
      systemInstruction: `You are an expert at simplifying Indian government schemes for citizens.
Rewrite the provided scheme details into very simple, human-readable bullet points at a 5th-grade reading level with no bureaucratic jargon.
Provide concise bullet points for each of: overview, benefits, eligibility, and applicationProcess.`,
      prompt: `Simplify this scheme:
Scheme Name: ${scheme.scheme_name}
Description: ${scheme.detailed_description || scheme.brief_description || "Not provided"}
Benefits: ${Array.isArray(scheme.benefits) ? scheme.benefits.join("; ") : scheme.benefits || "Not provided"}
Eligibility: ${Array.isArray(scheme.eligibility) ? scheme.eligibility.join("; ") : scheme.eligibility || "Not provided"}
Application Process: ${Array.isArray(scheme.application_process) ? scheme.application_process.join("; ") : scheme.application_process || "Not provided"}
Categories: ${scheme.categories?.join(", ") || ""}
Tags: ${scheme.tags?.join(", ") || ""}`,
      responseSchema: explainSchema,
    });

    await saveSchemeAiSummary(scheme._id, summary);

    return res.status(200).json({
      success: true,
      schemeId: scheme._id,
      schemeName: scheme.scheme_name,
      summary,
    });
  } catch (err) {
    console.error("AI explain error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: err?.message || "AI service unavailable",
    });
  }
};
