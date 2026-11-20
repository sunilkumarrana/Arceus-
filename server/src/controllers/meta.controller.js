// src/controllers/meta.controller.js

import {
  getDistinctSchemeCategories,
  getDistinctSchemeTags,
} from "../../../src/db/schemes.ts";

export const getCategories = async (req, res) => {
  try {
    const categories = await getDistinctSchemeCategories();

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch categories",
    });
  }
};

export const getTags = async (req, res) => {
  try {
    const tags = await getDistinctSchemeTags();

    res.status(200).json({
      success: true,
      count: tags.length,
      data: tags,
    });
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch tags",
    });
  }
};
