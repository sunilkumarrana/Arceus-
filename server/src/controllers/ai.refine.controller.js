import { generateGeminiJson, Type } from "../services/gemini.service.js";

const refineSchema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

export const aiRefineController = async (req, res) => {
  const { query, schemes } = req.body;
  if (!query || !schemes || !Array.isArray(schemes)) {
    return res.status(400).json({
      success: false,
      message: "query and schemes array are required",
    });
  }

  try {
    const filteredIds = await generateGeminiJson({
      systemInstruction:
        "You are a scheme filter assistant. Return a JSON array of scheme _id strings from the provided list that match the user's natural language query.",
      prompt: `User query: "${query}"

Schemes:
${JSON.stringify(
  schemes.map((s) => ({
    _id: s._id,
    name: s.scheme_name || s.name,
    categories: s.categories,
    tags: s.tags,
    matched: s.matched,
  })),
  null,
  2
)}`,
      responseSchema: refineSchema,
    });

    if (!Array.isArray(filteredIds) || filteredIds.length === 0) {
      return res.status(200).json({
        success: true,
        query,
        filteredSchemes: schemes,
        warning: "Could not apply filter, showing all results",
      });
    }

    const filteredSchemes = schemes.filter((s) =>
      filteredIds.includes(String(s._id))
    );

    return res.status(200).json({
      success: true,
      query,
      filteredSchemes,
    });
  } catch (err) {
    console.error("AI refine error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: err?.message || "AI service unavailable",
    });
  }
};
