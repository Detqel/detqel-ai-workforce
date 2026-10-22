import { LOOKUP_RESOURCES } from "@/constants/apiConstants";
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
  createResourceClient<LookupItem, LookupInput>(`${LOOKUP_RESOURCES.root}/${encodeURIComponent(resource)}`);

export const connectorTypesApi = createLookupClient(LOOKUP_RESOURCES.connectorTypes);
