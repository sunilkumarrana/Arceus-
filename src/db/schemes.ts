// src/db/schemes.ts
import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { db } from './index.ts';
import { schemes, type SchemeAiSummary } from './schema.ts';

export interface SchemeRecord {
  _id: string;
  scheme_name: string;
  short_title: string | null;
  ministry: string | null;
  department: string | null;
  level: string | null;
  state: string | null;
  categories: string[];
  sub_categories: string[];
  tags: string[];
  beneficiary_type: string | null;
  benefit_type: string | null;
  brief_description: string | null;
  detailed_description: string | null;
  benefits: string[];
  eligibility: string[];
  application_mode: string | null;
  application_process: string[];
  documents_required: string[];
  references: string[];
  scheme_open_date: string | null;
  ai_summary: SchemeAiSummary | null;
}

function toApiScheme(row: typeof schemes.$inferSelect): SchemeRecord {
  return {
    _id: row.id,
    scheme_name: row.schemeName,
    short_title: row.shortTitle,
    ministry: row.ministry,
    department: row.department,
    level: row.level,
    state: row.state,
    categories: Array.isArray(row.categories) ? row.categories : [],
    sub_categories: Array.isArray(row.subCategories) ? row.subCategories : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    beneficiary_type: row.beneficiaryType,
    benefit_type: row.benefitType,
    brief_description: row.briefDescription,
    detailed_description: row.detailedDescription,
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    eligibility: Array.isArray(row.eligibility) ? row.eligibility : [],
    application_mode: row.applicationMode,
    application_process: Array.isArray(row.applicationProcess) ? row.applicationProcess : [],
    documents_required: Array.isArray(row.documentsRequired) ? row.documentsRequired : [],
    references: Array.isArray(row.references) ? row.references : [],
    scheme_open_date: row.schemeOpenDate,
    ai_summary: row.aiSummary ?? null,
  };
}

export async function listSchemes(options: {
  page?: number;
  limit?: number;
  state?: string;
  level?: string;
}) {
  try {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (options.state && options.state !== 'All') {
      if (options.state === 'Central') {
        conditions.push(or(eq(schemes.level, 'Central'), isNull(schemes.state)));
      } else {
        conditions.push(eq(schemes.state, options.state));
      }
    }
    if (options.level && options.level !== 'All') {
      conditions.push(eq(schemes.level, options.level));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      whereClause
        ? db
            .select()
            .from(schemes)
            .where(whereClause)
            .orderBy(asc(schemes.schemeName))
            .limit(limit)
            .offset(offset)
        : db
            .select()
            .from(schemes)
            .orderBy(asc(schemes.schemeName))
            .limit(limit)
            .offset(offset),
      whereClause
        ? db.select({ total: count() }).from(schemes).where(whereClause)
        : db.select({ total: count() }).from(schemes),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);
    return {
      schemes: rows.map(toApiScheme),
      total,
    };
  } catch (error) {
    console.error('Database query failed (listSchemes):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function findSchemeById(id: string): Promise<SchemeRecord | null> {
  try {
    const rows = await db.select().from(schemes).where(eq(schemes.id, id));
    if (!rows[0]) return null;
    return toApiScheme(rows[0]);
  } catch (error) {
    console.error('Database query failed (findSchemeById):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function searchSchemesInDb(options: {
  q?: string;
  state?: string;
  level?: string;
}): Promise<SchemeRecord[]> {
  try {
    const conditions = [];
    if (options.state && options.state !== 'All') {
      if (options.state === 'Central') {
        conditions.push(or(eq(schemes.level, 'Central'), isNull(schemes.state)));
      } else {
        conditions.push(eq(schemes.state, options.state));
      }
    }
    if (options.level && options.level !== 'All') {
      conditions.push(eq(schemes.level, options.level));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = whereClause
      ? await db.select().from(schemes).where(whereClause).orderBy(asc(schemes.schemeName))
      : await db.select().from(schemes).orderBy(asc(schemes.schemeName));

    const all = rows.map(toApiScheme);
    const term = (options.q || '').trim().toLowerCase();
    if (!term) return all;

    return all.filter((s) => {
      if (s.scheme_name?.toLowerCase().includes(term)) return true;
      if (s.short_title?.toLowerCase().includes(term)) return true;
      if (s.brief_description?.toLowerCase().includes(term)) return true;
      if (s.categories.some((c) => c.toLowerCase().includes(term))) return true;
      if (s.tags.some((t) => t.toLowerCase().includes(term))) return true;
      return false;
    });
  } catch (error) {
    console.error('Database query failed (searchSchemesInDb):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getAllSchemesForMatching(state?: string | null): Promise<SchemeRecord[]> {
  try {
    const rows = state
      ? await db
          .select()
          .from(schemes)
          .where(or(eq(schemes.state, state), isNull(schemes.state), eq(schemes.state, '')))
      : await db.select().from(schemes);

    return rows.map(toApiScheme);
  } catch (error) {
    console.error('Database query failed (getAllSchemesForMatching):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getDistinctSchemeCategories(): Promise<string[]> {
  try {
    const rows = await db.select({ categories: schemes.categories }).from(schemes);
    const set = new Set<string>();
    for (const row of rows) {
      if (Array.isArray(row.categories)) {
        row.categories.forEach((c) => c && set.add(c));
      }
    }
    return Array.from(set).sort();
  } catch (error) {
    console.error('Database query failed (getDistinctSchemeCategories):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getDistinctSchemeTags(): Promise<string[]> {
  try {
    const rows = await db.select({ tags: schemes.tags }).from(schemes);
    const set = new Set<string>();
    for (const row of rows) {
      if (Array.isArray(row.tags)) {
        row.tags.forEach((t) => t && set.add(t));
      }
    }
    return Array.from(set).sort();
  } catch (error) {
    console.error('Database query failed (getDistinctSchemeTags):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function saveSchemeAiSummary(id: string, summary: SchemeAiSummary): Promise<void> {
  try {
    await db.update(schemes).set({ aiSummary: summary }).where(eq(schemes.id, id));
  } catch (error) {
    console.error('Database query failed (saveSchemeAiSummary):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
