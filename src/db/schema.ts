// src/db/schema.ts
import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export interface SchemeAiSummary {
  overview: string[];
  benefits: string[];
  eligibility: string[];
  applicationProcess: string[];
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  answers: jsonb('answers').$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const schemes = pgTable('schemes', {
  id: text('id').primaryKey(),
  schemeName: text('scheme_name').notNull(),
  shortTitle: text('short_title'),
  ministry: text('ministry'),
  department: text('department'),
  level: text('level'),
  state: text('state'),
  categories: jsonb('categories').$type<string[]>().notNull().default([]),
  subCategories: jsonb('sub_categories').$type<string[]>().notNull().default([]),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  beneficiaryType: text('beneficiary_type'),
  benefitType: text('benefit_type'),
  briefDescription: text('brief_description'),
  detailedDescription: text('detailed_description'),
  benefits: jsonb('benefits').$type<string[]>().notNull().default([]),
  eligibility: jsonb('eligibility').$type<string[]>().notNull().default([]),
  applicationMode: text('application_mode'),
  applicationProcess: jsonb('application_process').$type<string[]>().notNull().default([]),
  documentsRequired: jsonb('documents_required').$type<string[]>().notNull().default([]),
  references: jsonb('references').$type<string[]>().notNull().default([]),
  schemeOpenDate: text('scheme_open_date'),
  aiSummary: jsonb('ai_summary').$type<SchemeAiSummary | null>(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));
