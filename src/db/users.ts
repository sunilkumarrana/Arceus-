// src/db/users.ts
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users, userProfiles } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserProfileByUid(uid: string) {
  try {
    const rows = await db
      .select({
        profileId: userProfiles.id,
        answers: userProfiles.answers,
        updatedAt: userProfiles.updatedAt,
      })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(eq(users.uid, uid));

    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed (getUserProfileByUid):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertUserProfile(userId: number, answers: Record<string, string>) {
  try {
    const result = await db
      .insert(userProfiles)
      .values({
        userId,
        answers,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          answers,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (upsertUserProfile):', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
