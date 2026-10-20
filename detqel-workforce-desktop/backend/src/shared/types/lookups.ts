export type LookupValue = {
    id: string;
    code: string;
    name: string;
    description: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
};

export type NewLookupValue = Pick<LookupValue, "code" | "name"> &
    Partial<Pick<LookupValue, "description" | "sortOrder">>;
