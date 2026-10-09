import { eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { IRepository, Pagination } from "../../../shared/contracts/repository.js";
import type { DatabaseSession } from "../connection.js";

export abstract class BaseRepository<
  TTable extends PgTable & { id: PgColumn },
  TSelect = TTable["$inferSelect"],
  TInsert extends Record<string, unknown> = TTable["$inferInsert"]
> implements IRepository<TSelect, TInsert> {
  constructor(protected readonly table: TTable, protected readonly database: DatabaseSession) {}

  // Drizzle cannot retain a concrete table's column map through a generic class.
  // Confine the table/result assertions here; specialized repositories stay fully inferred.
  async findById(id: string): Promise<TSelect | null> {
    const [result] = await this.database.select().from(this.table as PgTable).where(eq(this.table.id, id)).limit(1);
    return result ? result as TSelect : null;
  }

  async findMany(options?: Pagination & { where?: SQL }): Promise<TSelect[]> {
    let query = this.database.select().from(this.table as PgTable).$dynamic();
    if (options?.where) query = query.where(options.where);
    query = query.limit(options?.limit ?? 100).offset(options?.offset ?? 0);
    return await query as TSelect[];
  }

  async create(data: TInsert): Promise<TSelect> {
    const [result] = await this.database.insert(this.table as PgTable).values(data).returning();
    return result as TSelect;
  }

  async createMany(data: TInsert[]): Promise<TSelect[]> {
    if (data.length === 0) return [];
    return await this.database.insert(this.table as PgTable).values(data).returning() as TSelect[];
  }

  async update(id: string, data: Partial<TInsert>): Promise<TSelect | null> {
    const payload: Record<string, unknown> = { ...data };
    if ("updatedAt" in this.table) payload.updatedAt = new Date();
    const [result] = await this.database.update(this.table as PgTable).set(payload).where(eq(this.table.id, id)).returning();
    return result ? result as TSelect : null;
  }

  async delete(id: string): Promise<boolean> {
    const results = await this.database.delete(this.table as PgTable).where(eq(this.table.id, id)).returning();
    return results.length > 0;
  }

  async count(where?: SQL): Promise<number> {
    let query = this.database.select({ count: sql<number>`cast(count(*) as integer)` }).from(this.table as PgTable).$dynamic();
    if (where) query = query.where(where);
    const [result] = await query;
    return result?.count ?? 0;
  }
}
