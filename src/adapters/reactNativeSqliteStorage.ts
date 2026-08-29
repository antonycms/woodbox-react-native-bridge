import type { ExecuteSqlParams, SqliteExecutionResult } from '../protocol';
import type { WoodboxBridgeAdapter } from './types';

interface SQLiteResultSet {
  rows: {
    length: number;
    item(index: number): Record<string, unknown>;
  };
  rowsAffected?: number;
  insertId?: number;
}

interface SQLiteDatabase {
  executeSql(
    sql: string,
    params?: unknown[],
    success?: (result: SQLiteResultSet) => void,
    failure?: (error: Error) => void,
  ): Promise<[SQLiteResultSet]> | void;
}

export interface ReactNativeSqliteStorageAdapterParams {
  id: string;
  label: string;
  database: SQLiteDatabase;
}

const rowsToArray = (result: SQLiteResultSet) => {
  const rows: Record<string, unknown>[] = [];

  for (let index = 0; index < result.rows.length; index += 1) {
    rows.push(result.rows.item(index));
  }

  return rows;
};

const executeSql = async (
  database: SQLiteDatabase,
  { sql, params = [] }: ExecuteSqlParams,
): Promise<SqliteExecutionResult> => {
  const promiseResult = database.executeSql(sql, params);

  if (promiseResult && typeof promiseResult.then === 'function') {
    const [result] = await promiseResult;

    return {
      rows: rowsToArray(result),
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }

  return new Promise((resolve, reject) => {
    database.executeSql(
      sql,
      params,
      (result) => {
        resolve({
          rows: rowsToArray(result),
          rowsAffected: result.rowsAffected,
          insertId: result.insertId,
        });
      },
      reject,
    );
  });
};

export const createReactNativeSqliteStorageAdapter = ({
  id,
  label,
  database,
}: ReactNativeSqliteStorageAdapterParams): WoodboxBridgeAdapter => ({
  id,
  label,
  kind: 'sqlite',
  dialect: 'sqlite',
  model: 'relational',
  executeSql: (params) => executeSql(database, params),
});
