

interface PaginationParams {
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
}

interface IJsonQuery {
  filter(field: string, key: string, value: any): [string, string];
  sortBy(field: string, sortBy: string, direction: string): string;
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export abstract class Paginator {
  constructor(protected readonly pagination: PaginationParams | undefined) {}

  apply<T>(data: T): T {
    if (!this.pagination || Object.keys(this.pagination).length === 0) {
      return data;
    }
    return this.limit(this.sort(data));
  }

  protected abstract sort(data: any): any;

  protected abstract limit(data: any): any;
}

export class PaginatorInMemory extends Paginator {
  protected sort(data: any[]) {
    if (!this.pagination?.sortBy) {
      return data;
    }
    const iteratee = this.NullLast(this.pagination.sortBy);
    const factor = (this.pagination.sortOrder as 'asc' | 'desc') === 'desc' ? -1 : 1;
    return [...data].sort((a, b) => {
      const av = iteratee(a);
      const bv = iteratee(b);
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * factor;
    });
  }

  protected limit(data: any[]) {
    if (!this.pagination?.limit) {
      return data;
    }
    const offset = this.pagination.offset || 0;
    const limit = this.pagination.limit || Infinity;
    return data.slice(offset, offset + limit);
  }

  NullLast(field: any) {
    return (item: any) => {
      const value = item?.[field];
      if (value == null) {
        return -Infinity;
      }
      return value;
    };
  }
}

export class KnexPaginator extends Paginator {
  indexes: string[] = [];
  dataField: string = 'data';

  constructor(
    pagination: PaginationParams | undefined,
    protected jsonQuery: IJsonQuery,
    protected tableName?: string,
  ) {
    super(pagination);
    if (tableName) {
      this.dataField = `${tableName}.data`;
    }
  }

  protected sort(query: any) {
    if (!this.pagination?.sortBy) {
      return query;
    }
    const sortBy = this.pagination.sortBy;
    const direction = this.pagination.sortOrder || SortOrder.ASC;
    if (this.indexes.includes(sortBy)) {
      return query.orderBy(sortBy, direction);
    }

    const sql = this.jsonQuery.sortBy(this.dataField, sortBy, direction);
    return query.orderByRaw(sql);
  }

  protected limit(query: any) {
    const limit = this.pagination?.limit;
    const offset = this.pagination?.offset;
    if (limit != null) {
      query = query.limit(limit);
    }
    if (offset != null) {
      query = query.offset(offset);
    }
    return query;
  }
}
