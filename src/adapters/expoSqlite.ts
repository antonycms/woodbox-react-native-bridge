import type { ExecuteSqlParams, SqliteExecutionResult } from '../protocol';
import type { WoodboxBridgeAdapter } from './types';

interface ExpoSQLiteRunResult {
  changes?: number;
  lastInsertRowId?: number;
}

interface ExpoSQLiteExecuteAsyncResult extends ExpoSQLiteRunResult {
  getAllAsync<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T[]>;
}

interface ExpoSQLiteStatement {
  executeAsync(params?: unknown[]): Promise<ExpoSQLiteExecuteAsyncResult>;
  finalizeAsync(): Promise<void>;
}

interface ExpoSQLiteDatabase {
  prepareAsync(sql: string): Promise<ExpoSQLiteStatement>;
}

export interface ExpoSqliteAdapterParams {
  id: string;
  label: string;
  database: ExpoSQLiteDatabase;
}

const executeSql = async (
  database: ExpoSQLiteDatabase,
  { sql, params = [] }: ExecuteSqlParams,
): Promise<SqliteExecutionResult> => {
  const statement = await database.prepareAsync(sql);

  try {
    const result = await statement.executeAsync(params);
    const rows = await result.getAllAsync();

    return {
      rows,
      rowsAffected: result.changes,
      insertId: result.lastInsertRowId,
    };
  } finally {
    await statement.finalizeAsync();
  }
};

export const createExpoSqliteAdapter = ({
  id,
  label,
  database,
}: ExpoSqliteAdapterParams): WoodboxBridgeAdapter => ({
  id,
  label,
  kind: 'sqlite',
  dialect: 'sqlite',
  model: 'relational',
  executeSql: (params) => executeSql(database, params),
});
