// src/controllers/recommendation.controller.js

import { getAllSchemesForMatching } from "../../../src/db/schemes.ts";
import {
  rankSchemes,
  attachAlternatives,
} from "../services/recommendation.service.js";
import { CATEGORY_MAP, SUB_CATEGORY_MAP, TAG_MAP } from "../constants/category.mapping.js";

export const recommendSchemes = async (req, res) => {
  try {
    const userProfile = { ...req.body };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const schemes = await getAllSchemesForMatching();

    if (userProfile.category && CATEGORY_MAP[userProfile.category]) {
      userProfile.category = CATEGORY_MAP[userProfile.category];
    }

    if (userProfile.subCategory && SUB_CATEGORY_MAP[userProfile.subCategory]) {
      userProfile.subCategory = SUB_CATEGORY_MAP[userProfile.subCategory];
    }

    if (userProfile.category && TAG_MAP[userProfile.category]) {
      userProfile.tags = [...(userProfile.tags || []), ...TAG_MAP[userProfile.category]];
    }

    if (userProfile.state && Array.isArray(userProfile.tags)) {
      userProfile.tags = userProfile.tags.filter((tag) => tag !== userProfile.state);
    }

    const ranked = rankSchemes(userProfile, schemes);
    const paginated = ranked.slice(startIndex, endIndex);
    const withAlternatives = attachAlternatives(paginated, schemes);

    res.status(200).json({
      success: true,
      page,
      limit,
      total: ranked.length,
      totalPages: Math.ceil(ranked.length / limit),
      count: withAlternatives.length,
      data: withAlternatives,
    });
  } catch (error) {
    console.error("Failed to generate recommendations:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate recommendations",
    });
  }
};
