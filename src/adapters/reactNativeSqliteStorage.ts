import type { ExecuteSqlParams, SqliteExecutionResult } from '../protocol';
import type { WoodboxBridgeAdapter } from './types';

interface SQLiteResultSet {
  rows?: {
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
    success?: (...args: unknown[]) => void,
    failure?: (...args: unknown[]) => void | boolean,
  ): Promise<[SQLiteResultSet]> | void;
}

export interface ReactNativeSqliteStorageAdapterParams {
  id: string;
  label: string;
  database: SQLiteDatabase;
}

const rowsToArray = (result?: SQLiteResultSet) => {
  const source = result?.rows;
  const rows: Record<string, unknown>[] = [];

  if (!source) return rows;

  for (let index = 0; index < source.length; index += 1) {
    rows.push(source.item(index));
  }

  return rows;
};

const toExecutionResult = (result?: SQLiteResultSet): SqliteExecutionResult => ({
  rows: rowsToArray(result),
  rowsAffected: result?.rowsAffected,
  insertId: result?.insertId,
});

const isSQLiteResultSet = (value: unknown): value is SQLiteResultSet => {
  if (!value || typeof value !== 'object') return false;

  const result = value as SQLiteResultSet;
  return Boolean(result.rows) || 'rowsAffected' in result || 'insertId' in result;
};

const getCallbackResult = (args: unknown[]) => args.find(isSQLiteResultSet);

const getLastTruthy = (values: unknown[]) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]) return values[index];
  }

  return undefined;
};

const normalizeNativeError = (error: unknown): Error => {
  if (error instanceof Error) return error;

  if (Array.isArray(error)) {
    return normalizeNativeError(getLastTruthy(error) ?? 'Erro desconhecido');
  }

  if (typeof error === 'string') return new Error(error);

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = [record.message, record.detail, record.code]
      .find((value) => typeof value === 'string' && value.trim());

    if (typeof message === 'string') return new Error(message);

    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('Erro desconhecido do SQLite nativo.');
    }
  }

  return new Error(String(error || 'Erro desconhecido'));
};

const executeSql = async (
  database: SQLiteDatabase,
  { sql, params = [] }: ExecuteSqlParams,
): Promise<SqliteExecutionResult> => {
  return new Promise((resolve, reject) => {
    let settled = false;

    const resolveOnce = (result?: SQLiteResultSet) => {
      if (settled) return;

      settled = true;
      resolve(toExecutionResult(result));
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;

      settled = true;
      reject(normalizeNativeError(error));
    };

    try {
      const promiseResult = database.executeSql(
        sql,
        params,
        (...args) => resolveOnce(getCallbackResult(args)),
        (...args) => {
          rejectOnce(getLastTruthy(args));
          return false;
        },
      );

      if (promiseResult && typeof promiseResult.then === 'function') {
        promiseResult.then(([result]) => resolveOnce(result)).catch(rejectOnce);
      }
    } catch (error) {
      rejectOnce(error);
    }
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
