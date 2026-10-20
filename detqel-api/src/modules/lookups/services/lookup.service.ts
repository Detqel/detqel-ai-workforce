import { AppError } from "../../../shared/errors/app-error.js";
import type { NewLookupValue } from "../../../shared/types/lookups.js";
import type { ILookupRepository } from "../repositories/lookup.repository.js";

export class LookupService {
    constructor(private readonly repository: ILookupRepository) {}

    private resource(name: string) {
        const repository = this.repository.get(name);
        if (!repository) throw new AppError(404, "Lookup resource not found");
        return repository;
    }

    list(resource: string) { return this.resource(resource).findMany(); }
    async getById(resource: string, id: string) {
        const item = await this.resource(resource).findById(id);
        if (!item) throw new AppError(404, "Lookup value not found");
        return item;
    }
    create(resource: string, data: NewLookupValue) { return this.resource(resource).create(data); }
    async update(resource: string, id: string, data: Partial<NewLookupValue>) {
        const item = await this.resource(resource).update(id, data);
        if (!item) throw new AppError(404, "Lookup value not found");
        return item;
    }
    async delete(resource: string, id: string) {
        const success = await this.resource(resource).delete(id);
        if (!success) throw new AppError(404, "Lookup value not found");
        return { success };
    }
}
