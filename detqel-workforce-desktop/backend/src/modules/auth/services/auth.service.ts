import { AppError } from "../../../shared/errors/app-error.js";
import type { LicensePortalClient, PortalClientMetadata } from "../../../shared/licensing/license-portal.client.js";
import type { LicenseClaims, LicenseTokenVerifier } from "../../../shared/licensing/license-token.verifier.js";
import { verifyPassword } from "../../../shared/security/password.js";
import type { NewUser, User } from "../../../shared/types/entities.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
import type { IWorkspaceRepository } from "../../workspaces/repositories/workspace.repository.js";
import type { SessionService } from "../../../shared/security/session.js";
import type { RegisterInput } from "../validation/auth.schemas.js";
function profile(user: User) {
    return {
        id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, status: user.status,
        firstName: user.firstName, lastName: user.lastName, companyName: user.companyName, country: user.country, state: user.state,
        // expiresAt is the license's own end date (null: no expiry), not the shorter session-token lifetime.
        license: user.licenseId ? { id: user.licenseId, type: user.licenseType, name: user.licenseName, billing: user.licenseBilling, expiresAt: user.licenseEndsAt } : null,
    };
}
/** The local copy of a portal identity and its license, taken only from verified token claims. */
function identityFrom(claims: LicenseClaims, token: string): Partial<NewUser> & Pick<NewUser, "name" | "email"> {
    return {
        portalUserId: claims.sub,
        name: claims.user.displayName,
        email: claims.user.email,
        username: claims.user.username,
        firstName: claims.user.firstName,
        lastName: claims.user.lastName,
        companyName: claims.user.companyName,
        country: claims.user.country,
        state: claims.user.state,
        licenseId: claims.license.id,
        licenseType: claims.license.type,
        licenseName: claims.license.name ?? null,
        licenseBilling: claims.license.billing,
        licenseToken: token,
        licenseExpiresAt: new Date(claims.exp * 1000),
        licenseEndsAt: claims.license.expiresAt ? new Date(claims.license.expiresAt) : null,
    };
}
/**
 * Accounts and licenses live in the DETQEL License Portal. Registration requests a license there; sign-in
 * exchanges credentials for a signed license token, verifies it, and mirrors the identity into this database.
 */
export class AuthService {
    constructor(
        private readonly users: IUserRepository,
        private readonly workspaces: IWorkspaceRepository,
        private readonly sessions: SessionService,
        private readonly portal: LicensePortalClient,
        private readonly licenses: LicenseTokenVerifier,
        private readonly installation: PortalClientMetadata,
    ) { }
    /** The licenses a new user can request, as currently offered on the License Portal. */
    async licenseOptions() {
        return { options: await this.portal.licenseOptions() };
    }
    async register(input: RegisterInput) {
        const { confirmPassword: _confirmed, ...registration } = input;
        const result = await this.portal.register(registration);
        return { status: result.status, licenseId: result.licenseId, message: result.message };
    }
    async login(username: string, password: string) {
        const grant = await this.portal.login(username, password, this.installation);
        const claims = await this.licenses.verify(grant.token);
        const user = await this.syncUser(claims, grant.token, password);
        if (user.status !== "active")
            throw new AppError(403, "This account has been disabled on this KIN installation.");
        const workspaces = await this.workspaces.listAuthWorkspaces(user.id);
        return { user: profile(user), workspaces, hasWorkspace: workspaces.length > 0, ...this.sessions.issue(user.id, user.licenseExpiresAt) };
    }
    /** Returns the signed-in user's profile and a renewed token. `userId` comes from a verified session, never from the client. */
    async me(userId: string) {
        const user = await this.users.findById(userId);
        if (!user || user.status !== "active")
            throw new AppError(404, "User not found");
        const workspaces = await this.workspaces.listAuthWorkspaces(user.id);
        return {
            user: profile(user),
            workspaces,
            hasWorkspace: workspaces.length > 0,
            ...this.sessions.issue(user.id, user.licenseExpiresAt),
        };
    }
    private async syncUser(claims: LicenseClaims, token: string, password: string): Promise<User> {
        const identity = identityFrom(claims, token);
        const linked = await this.users.findByPortalUserId(claims.sub);
        if (linked) return this.updated(linked.id, identity);
        // First portal sign-in on this installation. A local account with the same username or email is adopted
        // only when the same password unlocks it, which proves the person signing in owns it.
        const local = (await this.users.findByIdentifier(claims.user.username)) ?? (await this.users.findByEmail(claims.user.email));
        if (local) {
            if (local.portalUserId || !verifyPassword(password, local.passwordHash))
                throw new AppError(409, "Another account on this KIN installation already uses this username or email.");
            // Local passwords are retired once the account is linked; the portal checks credentials from now on.
            return this.updated(local.id, { ...identity, passwordHash: null });
        }
        return this.users.create({ ...identity, status: "active" });
    }
    private async updated(id: string, changes: Partial<NewUser>): Promise<User> {
        const user = await this.users.update(id, changes);
        if (!user) throw new AppError(409, "The account changed while signing in. Try again.");
        return user;
    }
}
