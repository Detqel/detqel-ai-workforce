import type { IRepository } from "../../../shared/contracts/repository.js";
import type { NewUser, User } from "../../../shared/types/entities.js";
import type { UserWithMemberships } from "../../../shared/types/graphs.js";
export interface IUserRepository extends IRepository<User, NewUser> {
    findByEmail(email: string): Promise<User | null>;
    findByIdentifier(identifier: string): Promise<User | null>;
    findWithMemberships(userId: string): Promise<UserWithMemberships | undefined>;
}
