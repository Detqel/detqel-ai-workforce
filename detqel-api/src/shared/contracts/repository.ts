export interface Pagination {
    limit?: number;
    offset?: number;
}
export interface IRepository<TEntity, TCreate> {
    findById(id: string): Promise<TEntity | null>;
    findMany(options?: Pagination): Promise<TEntity[]>;
    create(data: TCreate): Promise<TEntity>;
    createMany(data: TCreate[]): Promise<TEntity[]>;
    update(id: string, data: Partial<TCreate>): Promise<TEntity | null>;
    delete(id: string): Promise<boolean>;
    count(): Promise<number>;
}
