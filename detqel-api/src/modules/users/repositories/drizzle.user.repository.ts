import { eq, or, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { users, type NewUser, type User } from "../../../infrastructure/database/schema/auth.js";
import type { IUserRepository } from "./user.repository.js";
export class UserRepository extends BaseRepository<typeof users, User, NewUser> implements IUserRepository {
    constructor(database: DatabaseSession) {
        super(users, database);
    }
    async findByEmail(email: string): Promise<User | null> {
        const term = email.toLowerCase().trim();
        const results = await this.database
            .select()
            .from(users)
            .where(sql `lower(trim(${users.email})) = ${term}`)
            .limit(1);
        return results[0] || null;
    }
    async findByIdentifier(identifier: string): Promise<User | null> {
        const term = identifier.toLowerCase().trim();
        const results = await this.database
            .select()
            .from(users)
            .where(or(sql `lower(trim(${users.email})) = ${term}`, sql `lower(trim(${users.username})) = ${term}`))
            .limit(1);
        return results[0] || null;
    }
    async findWithMemberships(userId: string) {
        return this.database.query.users.findFirst({
            where: eq(users.id, userId),
            with: {
                memberships: {
                    with: {
                        workspace: true,
                    },
                },
            },
        });
    }
}
