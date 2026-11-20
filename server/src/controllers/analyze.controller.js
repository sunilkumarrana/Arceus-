// server/src/controllers/analyze.controller.js

import { getAllSchemesForMatching } from "../../../src/db/schemes.ts";
import { upsertUserProfile } from "../../../src/db/users.ts";
import { rankSchemes, attachAlternatives } from "../services/recommendation.service.js";
import { generateGeminiJson, Type } from "../services/gemini.service.js";
import { CATEGORY_MAP, SUB_CATEGORY_MAP, TAG_MAP } from "../constants/category.mapping.js";

const GOAL_TO_CATEGORY = {
  "Scholarships & Education":    "Education & Learning",
  "Education":                   "Education & Learning",
  "Healthcare Support":          "Health & Wellness",
  "Healthcare":                  "Health & Wellness",
  "Health":                      "Health & Wellness",
  "Agriculture Support":         "Agriculture,Rural & Environment",
  "Agriculture":                 "Agriculture,Rural & Environment",
  "Business Funding":            "Business & Entrepreneurship",
  "Startup Support":             "Business & Entrepreneurship",
  "Business & Entrepreneurship": "Business & Entrepreneurship",
  "Business":                    "Business & Entrepreneurship",
  "Housing & Welfare":           "Housing & Shelter",
  "Housing":                     "Housing & Shelter",
  "Employment":                  "Skills & Employment",
  "Skill Development":           "Skills & Employment",
  "Women Empowerment":           "Women and Child",
  "Financial Assistance":        "Banking,Financial Services and Insurance",
  "Pension & Senior Benefits":   "Social welfare & Empowerment",
  "Social Welfare":              "Social welfare & Empowerment",
  "Transport":                   "Transport & Infrastructure",
  "Utility":                     "Utility & Sanitation",
  "Sanitation":                  "Utility & Sanitation",
  "Science & Technology":        "Science, IT & Communications",
};

const GOAL_TO_SUB_CATEGORY = {
  "Scholarships & Education": "Scholarships and student finance",
  "Skill Development":        "Training and Skill Up-gradation",
  "Employment":               "Employment services and jobs",
};

const OCCUPATION_TO_TAGS = {
  "Student":       ["Student"],
  "Farmer":        ["Farmer", "Agriculture"],
  "Unemployed":    ["Unemployed", "Job Seeker"],
  "Self Employed": ["Self Employed", "Entrepreneur"],
  "Salaried":      ["Salaried"],
  "Business":      ["Business", "Entrepreneur"],
  "Business Owner": ["Business", "Entrepreneur", "Self Employed"],
  "Job Seeker":    ["Unemployed", "Job Seeker"],
  "Employee":      ["Salaried", "Employee"],
  "Homemaker":     ["Homemaker"],
  "Senior Citizen": ["Senior Citizens", "Old Age Pension", "Pension"],
};

const CASTE_TO_TAGS = {
  "SC":      ["SC", "Scheduled Caste", "Scheduled Castes"],
  "ST":      ["ST", "Scheduled Tribe", "Scheduled Tribes"],
  "OBC":     ["OBC", "Other Backward Class", "Other Backward Classes"],
  "EWS":     ["EWS", "Economically Weaker Section"],
  "General": ["General"],
};

const GENDER_TO_TAGS = {
  "Female": ["Women", "Girl", "Female"],
  "Male":   ["Male"],
  "Other":  ["Transgender", "Third Gender"],
};

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

function buildProfileFromAnswers(answers) {
  const {
    state,
    category: casteCategory,
    gender,
    goal: rawGoal,
    occupation: rawOccupation,
    disability,
    incomeRange,
    ageRange,
    educationLevel,
  } = answers;

  const goal = rawGoal || answers.primaryGoal || null;
  const occupation = rawOccupation || answers.bestProfileType || null;

  const schemeCategory =
    GOAL_TO_CATEGORY[goal] ?? CATEGORY_MAP[goal] ?? null;

  const schemeSubCategory =
    GOAL_TO_SUB_CATEGORY[goal] ?? SUB_CATEGORY_MAP[goal] ?? null;

  const tags = new Set();

  (CASTE_TO_TAGS[casteCategory] || []).forEach((t) => tags.add(t));
  (GENDER_TO_TAGS[gender] || []).forEach((t) => tags.add(t));
  (OCCUPATION_TO_TAGS[occupation] || []).forEach((t) => tags.add(t));

  if (disability && disability !== "No") {
    (TAG_MAP["Disability Support"] || []).forEach((t) => tags.add(t));
  }

  if (ageRange === "60+" || ageRange === "55-60") {
    (TAG_MAP["Senior Citizens"] || []).forEach((t) => tags.add(t));
  }

  const profile = {
    state:          state ?? null,
    gender,
    incomeRange,
    ageRange,
    educationLevel,
    occupation,
    goal,
    casteCategory:  casteCategory ?? null,
    category:    schemeCategory,
    subCategory: schemeSubCategory,
    tags:        [...tags],
  };

  Object.keys(profile).forEach((k) => {
    if (profile[k] == null || profile[k] === "") delete profile[k];
  });

  return profile;
}

async function analyzeController(req, res) {
  const session = req.session || {};

  let answers = Object.keys(req.body || {}).length > 0
    ? { ...req.body }
    : { ...(session.answers || {}) };

  // Step 1: Optional free text intake via Gemini
  if (answers.freeText) {
    try {
      const parsed = await generateGeminiJson({
        systemInstruction: `Extract structured fields from the user's free text for an Indian government scheme recommender. Only include confident fields.`,
        prompt: String(answers.freeText),
        responseSchema: intakeSchema,
      });
      answers = { ...parsed, ...answers };
    } catch (err) {
      console.warn("Optional Gemini freeText intake skipped:", err?.message);
    }
  }

  // Persist profile answers for authenticated user in PostgreSQL
  if (req.dbUser?.id && Object.keys(answers).length > 0) {
    try {
      await upsertUserProfile(req.dbUser.id, answers);
    } catch (err) {
      console.error("Failed to save user profile:", err);
    }
  }

  const profile = buildProfileFromAnswers(answers);

  const limit      = parseInt(req.query.limit) || 10;
  const page       = parseInt(req.query.page)  || 1;
  const startIndex = (page - 1) * limit;
  const endIndex   = startIndex + limit;

  try {
    const schemes = await getAllSchemesForMatching(profile.state || null);
    const ranked           = rankSchemes(profile, schemes);
    const paginated        = ranked.slice(startIndex, endIndex);
    const withAlternatives = attachAlternatives(paginated, schemes);

    return res.status(200).json({
      success: true,
      message: "Analysis complete",
      profile,
      recommendedSchemes: withAlternatives,
      page,
      limit,
      total:      ranked.length,
      totalPages: Math.ceil(ranked.length / limit),
    });
  } catch (err) {
    console.error("Analysis failed:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Analysis failed",
    });
  }
}

export { analyzeController };
