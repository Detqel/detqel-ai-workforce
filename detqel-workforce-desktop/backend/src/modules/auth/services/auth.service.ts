import { AppError } from "../../../shared/errors/app-error.js";
import { hashPassword, verifyPassword } from "../../../shared/security/password.js";
import type { User } from "../../../shared/types/entities.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
import type { IWorkspaceRepository } from "../../workspaces/repositories/workspace.repository.js";
function profile(user: User) {
    return { id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, status: user.status };
}
export class AuthService {
    constructor(private readonly users: IUserRepository, private readonly workspaces: IWorkspaceRepository) { }
    async checkUser(email?: string, username?: string) {
        if (!email && !username)
            throw new AppError(400, "Either email or username query parameter is required.");
        const [emailUser, usernameUser] = await Promise.all([email ? this.users.findByEmail(email) : null, username ? this.users.findByIdentifier(username) : null]);
        const user = emailUser || usernameUser;
        if (!user)
            return { exists: false, hasWorkspace: false, workspaceCount: 0 };
        const workspaces = await this.workspaces.listAuthWorkspaces(user.id);
        return { exists: true, emailMatch: !!emailUser, usernameMatch: !!usernameUser, hasWorkspace: workspaces.length > 0, workspaceCount: workspaces.length, user: { id: user.id, name: user.name, email: user.email, username: user.username } };
    }
    async login(identifier: string, password: string) {
        const user = await this.users.findByIdentifier(identifier);
        if (!user)
            throw new AppError(401, "Invalid credentials. No user found with this email or username.");
        if (!verifyPassword(password, user.passwordHash))
            throw new AppError(401, "Invalid credentials. Password is incorrect.");
        const workspaces = await this.workspaces.listAuthWorkspaces(user.id);
        return { user: profile(user), workspaces, hasWorkspace: workspaces.length > 0 };
    }
    async register(body: {
        name: string;
        email: string;
        username?: string;
        password: string;
    }) {
        const email = body.email.toLowerCase().trim(), username = body.username?.toLowerCase().trim() || null;
        const [byEmail, byUsername] = await Promise.all([this.users.findByEmail(email), username ? this.users.findByIdentifier(username) : null]);
        const existing = byEmail || byUsername;
        if (existing) {
            if (!verifyPassword(body.password, existing.passwordHash))
                throw new AppError(409, byEmail ? "An account with this email address already exists. Please sign in with your password." : "This username is already taken. Please sign in or choose another username.", { isExistingUser: true });
            const workspaces = await this.workspaces.listAuthWorkspaces(existing.id);
            return { user: profile(existing), workspaces, hasWorkspace: workspaces.length > 0, isExistingUser: true, message: "Existing account verified! Signed in to your workspace." };
        }
        const user = await this.users.create({ name: body.name.trim(), email, username, passwordHash: hashPassword(body.password), status: "active" });
        return { user: profile(user), workspaces: [], hasWorkspace: false, isExistingUser: false };
    }
    async me(userId?: string) {
        if (!userId)
            throw new AppError(400, "userId query parameter is required");
        const user = await this.users.findById(userId);
        if (!user)
            throw new AppError(404, "User not found");
        const workspaces = await this.workspaces.listAuthWorkspaces(user.id);
        return { user: profile(user), workspaces, hasWorkspace: workspaces.length > 0 };
    }
}
