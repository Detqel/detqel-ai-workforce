import { createResourceClient } from "./resource-client";

export interface LookupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export type LookupInput = Pick<LookupItem, "code" | "name"> & Partial<Pick<LookupItem, "description" | "sortOrder">>;

export const createLookupClient = (resource: string) =>
  createResourceClient<LookupItem, LookupInput>(`lookups/${encodeURIComponent(resource)}`);

export const connectorTypesApi = createLookupClient("connector-types");
