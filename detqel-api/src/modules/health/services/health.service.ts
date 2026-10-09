export class HealthService {
    constructor(private readonly checkDatabase: () => Promise<void>) { }
    async check() {
        try {
            await this.checkDatabase();
            return { status: "ok", database: "connected" };
        }
        catch {
            return { status: "degraded", database: "disconnected" };
        }
    }
}
