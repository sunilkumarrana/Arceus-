// src/controllers/scheme.controller.js

import {
  listSchemes,
  findSchemeById,
  searchSchemesInDb,
} from "../../../src/db/schemes.ts";

const getAllSchemes = async (req, res) => {
  try {
    const { page: pageQuery, limit: limitQuery, state, level } = req.query;
    const page = parseInt(pageQuery) || 1;
    const limit = parseInt(limitQuery) || 10;

    const { schemes, total } = await listSchemes({ page, limit, state, level });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: schemes,
    });
  } catch (error) {
    console.error("Failed to fetch schemes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch schemes",
    });
  }
};

const getSchemeById = async (req, res) => {
  try {
    const scheme = await findSchemeById(req.params.id);

    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: "Scheme not found",
      });
    }

    res.status(200).json({
      success: true,
      data: scheme,
    });
  } catch (error) {
    console.error("Failed to fetch scheme by id:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch scheme details",
    });
  }
};

const searchSchemes = async (req, res) => {
  try {
    const { q = "", state, level } = req.query;
    const schemes = await searchSchemesInDb({ q, state, level });

    res.json({
      success: true,
      data: schemes,
    });
  } catch (error) {
    console.error("Failed to search schemes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to search schemes",
    });
  }
};

export { getAllSchemes, getSchemeById, searchSchemes };
