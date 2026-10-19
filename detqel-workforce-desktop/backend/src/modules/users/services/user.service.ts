import type { NewUser, User } from "../../../shared/types/entities.js";
import type { UserWithMemberships } from "../../../shared/types/graphs.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
export class UserService {
    constructor(private readonly repository: IUserRepository) { }
    findByEmail(email: string): Promise<User | null> { return this.repository.findByEmail(email); }
    findWithMemberships(userId: string): Promise<UserWithMemberships | undefined> { return this.repository.findWithMemberships(userId); }
    findMany(options?: {
        limit?: number;
        offset?: number;
    }): Promise<User[]> { return this.repository.findMany(options); }
    create(data: NewUser): Promise<User> { return this.repository.create(data); }
}
