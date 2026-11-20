import { generateGeminiJson, Type } from "../services/gemini.service.js";

const eligibilityAdviceSchema = {
  type: Type.OBJECT,
  properties: {
    reasons: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    next_steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["reasons", "next_steps"],
};

export const aiEligibilityController = async (req, res) => {
  const { schemeId, failedCriteria, profile } = req.body;
  if (!schemeId || !failedCriteria || !profile) {
    return res.status(400).json({
      success: false,
      message: "schemeId, failedCriteria, and profile are required",
    });
  }

  try {
    const advice = await generateGeminiJson({
      systemInstruction: `You are an eligibility advisor for Indian government schemes. Be specific, actionable, and empathetic. Speak directly to the user.
Do not use markdown formatting (no **, no [], no links) inside any of the text values — plain text only.
Keep each bullet point to one sentence. Provide 1-3 reasons and 2-4 concrete, actionable next_steps.`,
      prompt: `A user is interested in a government scheme but does not fully qualify. Based on the gap analysis below, list why they do not qualify and what concrete steps they could take to find a better match or become eligible.

IMPORTANT - How to read the Gap Analysis:
- "expected" is the attribute the USER has in their profile or the requirement they missed.
- "actual" is the attribute the SCHEME requires or supports.

Failed criteria:
${JSON.stringify(failedCriteria, null, 2)}

User profile:
${JSON.stringify(profile, null, 2)}`,
      responseSchema: eligibilityAdviceSchema,
    });

    const reasonsArray = advice.reasons || [];
    const nextStepsArray = advice.next_steps || advice.nextSteps || [];

    if (!Array.isArray(reasonsArray) || !Array.isArray(nextStepsArray)) {
      throw new Error("AI response missing expected fields");
    }

    return res.status(200).json({
      success: true,
      schemeId,
      advice: {
        reasons: reasonsArray,
        nextSteps: nextStepsArray,
      },
    });
  } catch (err) {
    console.error("AI eligibility error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: err?.message || "AI service unavailable",
    });
  }
};
