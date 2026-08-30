import type { ExecuteSqlParams, SqliteExecutionResult } from '../protocol';
import type { WoodboxBridgeAdapter } from './types';

interface NitroSQLiteQueryResult {
  results?: Record<string, unknown>[];
  rows?: Record<string, unknown>[] | { _array?: Record<string, unknown>[] };
  rowsAffected?: number;
  insertId?: number;
}

interface NitroSQLiteDatabase {
  executeAsync?(query: string, params?: unknown[]): Promise<NitroSQLiteQueryResult>;
  execute?(query: string, params?: unknown[]): NitroSQLiteQueryResult;
}

export interface ReactNativeNitroSqliteAdapterParams {
  id: string;
  label: string;
  database: NitroSQLiteDatabase;
}

const getRows = (result: NitroSQLiteQueryResult) => {
  if (Array.isArray(result.results)) return result.results;
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.rows?._array)) return result.rows._array;

  return [];
};

const executeSql = async (
  database: NitroSQLiteDatabase,
  { sql, params = [] }: ExecuteSqlParams,
): Promise<SqliteExecutionResult> => {
  if (database.executeAsync) {
    const result = await database.executeAsync(sql, params);

    return {
      rows: getRows(result),
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }

  if (database.execute) {
    const result = database.execute(sql, params);

    return {
      rows: getRows(result),
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }

  throw new Error('Database não suporta executeAsync ou execute.');
};

export const createReactNativeNitroSqliteAdapter = ({
  id,
  label,
  database,
}: ReactNativeNitroSqliteAdapterParams): WoodboxBridgeAdapter => ({
  id,
  label,
  kind: 'sqlite',
  dialect: 'sqlite',
  model: 'relational',
  executeSql: (params) => executeSql(database, params),
});
