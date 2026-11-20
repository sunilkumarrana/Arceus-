import { generateGeminiJson, Type } from "../services/gemini.service.js";

const intakeSchema = {
  type: Type.OBJECT,
  properties: {
    state: { type: Type.STRING },
    category: { type: Type.STRING },
    gender: { type: Type.STRING },
    incomeRange: { type: Type.STRING },
    ageRange: { type: Type.STRING },
    educationLevel: { type: Type.STRING },
    occupation: { type: Type.STRING },
    goal: { type: Type.STRING },
  },
};

export const aiIntakeController = async (req, res) => {
  const { freeText } = req.body;
  if (!freeText || !String(freeText).trim()) {
    return res.status(400).json({ success: false, message: "freeText is required" });
  }

  try {
    const parsed = await generateGeminiJson({
      systemInstruction: `You are a profile extraction assistant for an Indian government scheme recommender.
Extract structured fields from the user's free text. Only include fields you are confident about:
- state: Indian state name
- category: Caste ("SC" | "ST" | "OBC" | "EWS" | "General")
- gender: ("Male" | "Female" | "Other")
- incomeRange: ("0-5k" | "5k-10k" | "10k-25k" | "25k+")
- ageRange: ("18-24" | "25-35" | "36-50" | "50-60" | "60+")
- educationLevel: ("Below 10th" | "10th" | "12th" | "Graduate" | "Postgraduate")
- occupation: ("Student" | "Farmer" | "Unemployed" | "Self Employed" | "Salaried")
- goal: ("Scholarships & Education" | "Healthcare" | "Agriculture" | "Business & Entrepreneurship" | "Housing" | "Employment" | "Skill Development" | "Women Empowerment" | "Financial Assistance")`,
      prompt: String(freeText),
      responseSchema: intakeSchema,
    });

    const cleaned = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof v === "string" && v.trim()) {
        cleaned[k] = v.trim();
      }
    }

    req.session = req.session || {};
    req.session.answers = { ...cleaned, ...(req.session.answers || {}) };

    return res.status(200).json({
      success: true,
      extracted: cleaned,
      merged: req.session.answers,
    });
  } catch (err) {
    console.error("AI intake error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: err?.message || "AI service unavailable",
    });
  }
};
