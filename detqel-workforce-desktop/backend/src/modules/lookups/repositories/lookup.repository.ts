import type { IRepository } from "../../../shared/contracts/repository.js";
import type { LookupValue, NewLookupValue } from "../../../shared/types/lookups.js";

export interface ILookupRepository {
    get(resource: string): IRepository<LookupValue, NewLookupValue> | null;
}
