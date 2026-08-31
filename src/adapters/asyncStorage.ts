import type { ExecuteSqlParams, SqliteExecutionResult } from '../protocol';
import type { WoodboxBridgeAdapter } from './types';

interface AsyncStorageLike {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AsyncStorageAdapterParams {
  id: string;
  label: string;
  storage: AsyncStorageLike;
}

type ParsedValue = string | null;
type AsyncStorageRow = { key: string; value: string | null; type: string };

const TABLE_NAME = 'async_storage';
const UNSUPPORTED_SQL_ERROR = 'SQL não suportado pelo adapter AsyncStorage.';

const normalizeSql = (sql: string) => sql.trim().replace(/;+\s*$/, '').replace(/\s+/g, ' ');
const quoteIdentifier = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
const quoteValue = (value: unknown) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};
const stripIdentifier = (value: string) => value.trim().replace(/^[`"\[]|[`"\]]$/g, '');
const isAsyncStorageSql = (sql: string) => new RegExp(`\\b${TABLE_NAME}\\b`, 'i').test(sql);

const inlineBindings = (sql: string, params: unknown[]) => {
  let index = 0;
  return sql.replace(/\?/g, () => quoteValue(params[index++]));
};

const inferType = (value: string | null) => {
  if (value === null) return 'null';

  const trimmed = value.trim();

  if (!trimmed) return 'string';
  if (trimmed === 'true' || trimmed === 'false') return 'boolean';
  if (!Number.isNaN(Number(trimmed))) return 'number';

  try {
    JSON.parse(trimmed);
    return 'json';
  } catch {
    return 'string';
  }
};

const unquoteSqlValue = (value: string): ParsedValue => {
  const trimmed = value.trim();

  if (/^null$/i.test(trimmed)) return null;

  const quoted = trimmed.match(/^'(.*)'$/s);
  if (quoted) return quoted[1].replace(/''/g, "'");

  return trimmed;
};

const splitSqlList = (value: string) => {
  const items: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const nextChar = value[index + 1];

    if (char === "'") {
      current += char;

      if (quoted && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (!quoted && char === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());

  return items;
};

const splitValueRows = (value: string) => {
  const rows: string[] = [];
  let current = '';
  let quoted = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const nextChar = value[index + 1];

    if (char === "'") {
      current += char;

      if (quoted && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (!quoted && char === '(') {
      depth += 1;
      if (depth === 1) continue;
    }

    if (!quoted && char === ')') {
      depth -= 1;
      if (depth === 0) {
        rows.push(current.trim());
        current = '';
        continue;
      }
    }

    if (depth > 0) current += char;
  }

  return rows;
};

const getWhereKey = (sql: string) => {
  const where = sql.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|\boffset\b|$)/i)?.[1] || '';
  const match = where.match(/(?:"key"|`key`|\[key\]|key)\s*=\s*('[^']*(?:''[^']*)*'|[^\s;)]+)/i);

  return match ? unquoteSqlValue(match[1]) : undefined;
};

const toRows = async (storage: AsyncStorageLike): Promise<AsyncStorageRow[]> => {
  const keys = await storage.getAllKeys();
  const items = await storage.multiGet(keys);

  return items.map(([key, value]) => ({
    key,
    value,
    type: inferType(value),
  }));
};

const applyWhere = (rows: AsyncStorageRow[], sql: string) => {
  const where = sql.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|\boffset\b|$)/i)?.[1];
  if (!where?.trim()) return rows;

  const keyEquals = getWhereKey(sql);
  if (keyEquals !== undefined) return rows.filter((row) => row.key === keyEquals);

  const like = where.match(/(?:"(key|value|type)"|`(key|value|type)`|\[(key|value|type)\]|\b(key|value|type)\b)\s+like\s+'([^']*)'/i);
  if (!like) return rows;

  const column = (like[1] || like[2] || like[3] || like[4]) as keyof AsyncStorageRow;
  const pattern = like[5].replace(/%/g, '').toLowerCase();

  return rows.filter((row) => String(row[column] ?? '').toLowerCase().includes(pattern));
};

const applyOrderAndPagination = (rows: AsyncStorageRow[], sql: string) => {
  const order = sql.match(/\border\s+by\s+(?:"(key|value|type)"|`(key|value|type)`|\[(key|value|type)\]|\b(key|value|type)\b)(?:\s+(asc|desc))?/i);
  const ordered = [...rows];

  if (order) {
    const column = (order[1] || order[2] || order[3] || order[4]) as keyof AsyncStorageRow;
    const direction = String(order[5] || 'asc').toLowerCase();

    ordered.sort((a, b) => {
      const result = String(a[column] ?? '').localeCompare(String(b[column] ?? ''));
      return direction === 'desc' ? -result : result;
    });
  }

  const limit = Number(sql.match(/\blimit\s+(\d+)/i)?.[1] || ordered.length);
  const offset = Number(sql.match(/\boffset\s+(\d+)/i)?.[1] || 0);

  return ordered.slice(offset, offset + limit);
};

const projectRows = (rows: AsyncStorageRow[], sql: string): Record<string, unknown>[] => {
  const select = sql.match(/^\s*select\s+([\s\S]*?)\s+from\s/i)?.[1]?.trim();

  if (!select || select === '*' || /__base_query/i.test(sql)) return rows;

  const columns = splitSqlList(select)
    .map((column) => stripIdentifier(column.replace(/\s+as\s+.+$/i, '')))
    .filter((column) => ['key', 'value', 'type'].includes(column));

  if (!columns.length) return rows;

  return rows.map((row) => {
    const projected: Record<string, string | null> = {};

    columns.forEach((column) => {
      projected[column] = row[column as keyof AsyncStorageRow];
    });

    return projected;
  });
};

const getTableColumns = () => [
  {
    column_name: 'key',
    data_type: 'text',
    udt_name: 'text',
    column_default: null,
    extra: null,
    is_auto_increment: false,
    description: null,
    is_nullable: false,
  },
  {
    column_name: 'value',
    data_type: 'text',
    udt_name: 'text',
    column_default: null,
    extra: null,
    is_auto_increment: false,
    description: null,
    is_nullable: true,
  },
  {
    column_name: 'type',
    data_type: 'text',
    udt_name: 'text',
    column_default: null,
    extra: null,
    is_auto_increment: false,
    description: null,
    is_nullable: true,
  },
];

const getTableDefinition = () =>
  `CREATE TABLE ${quoteIdentifier(TABLE_NAME)} (${quoteIdentifier('key')} text PRIMARY KEY, ${quoteIdentifier(
    'value',
  )} text, ${quoteIdentifier('type')} text);`;

const selectRows = async (storage: AsyncStorageLike, sql: string): Promise<SqliteExecutionResult> => {
  if (/^\s*select\s+1\s*$/i.test(sql)) return { rows: [{ '1': 1 }] };
  if (/^\s*select\s+'text'\s+as\s+name/i.test(sql)) return { rows: [{ name: 'text' }] };

  if (/\bconstraint_type\b/i.test(sql)) {
    return {
      rows: [
        {
          constraint_name: `pk_${TABLE_NAME}`,
          constraint_type: 'primary_key',
          constraint_definition: `PRIMARY KEY (${quoteIdentifier('key')})`,
          expression: null,
          column_names: 'key',
          comment: null,
        },
      ],
    };
  }

  if (/\bpragma_table_info\b/i.test(sql)) return { rows: getTableColumns() };

  if (/\bpragma_foreign_key_list\b|\bpragma_index_(?:list|info|xinfo)\b|\bfrom\s+dbstat\b|\btype\s*=\s*'trigger'/i.test(sql)) {
    return { rows: [] };
  }

  if (/\bfrom\s+sqlite_schema\b/i.test(sql)) {
    if (/\bsql\s+as\s+definition\b/i.test(sql)) return { rows: [{ definition: getTableDefinition() }] };

    return {
      rows: [
        {
          table_name: TABLE_NAME,
          table_schema: null,
          object_type: 'table',
          supports_indexes: false,
          supports_triggers: false,
          total_size: 0,
        },
      ],
    };
  }

  if (/^\s*select\b/i.test(sql) && /\bcount\(\*\)\s+as\s+total_rows\b/i.test(sql) && isAsyncStorageSql(sql)) {
    return { rows: [{ total_rows: applyWhere(await toRows(storage), sql).length }] };
  }

  if (/^\s*select\b/i.test(sql) && isAsyncStorageSql(sql)) {
    const rows = applyOrderAndPagination(applyWhere(await toRows(storage), sql), sql);
    return { rows: projectRows(rows, sql) };
  }

  throw new Error(UNSUPPORTED_SQL_ERROR);
};

const insertRows = async (storage: AsyncStorageLike, sql: string): Promise<SqliteExecutionResult> => {
  const match = sql.match(/insert\s+into\s+(?:"async_storage"|`async_storage`|\[async_storage\]|async_storage)\s*\(([^)]+)\)\s*values\s*([\s\S]+)$/i);

  if (!match) throw new Error(UNSUPPORTED_SQL_ERROR);

  const columns = splitSqlList(match[1]).map(stripIdentifier);
  const keyIndex = columns.indexOf('key');
  const valueIndex = columns.indexOf('value');

  if (keyIndex < 0 || valueIndex < 0) {
    throw new Error('INSERT precisa informar as colunas key e value.');
  }

  const valueRows = splitValueRows(match[2]);
  let rowsAffected = 0;

  for (const rowSql of valueRows) {
    const values = splitSqlList(rowSql).map(unquoteSqlValue);
    const key = values[keyIndex];

    if (typeof key !== 'string' || !key) throw new Error('A coluna key é obrigatória.');

    await storage.setItem(key, String(values[valueIndex] ?? ''));
    rowsAffected += 1;
  }

  return { rows: [], rowsAffected };
};

const updateRows = async (storage: AsyncStorageLike, sql: string): Promise<SqliteExecutionResult> => {
  const match = sql.match(/update\s+(?:"async_storage"|`async_storage`|\[async_storage\]|async_storage)\s+set\s+([\s\S]*?)\s+where\s+[\s\S]*$/i);
  const currentKey = getWhereKey(sql);

  if (!match || typeof currentKey !== 'string' || !currentKey) {
    throw new Error('UPDATE precisa filtrar pela coluna key.');
  }

  const assignments = Object.fromEntries(
    splitSqlList(match[1]).map((assignment) => {
      const [column, ...valueParts] = assignment.split('=');
      return [stripIdentifier(column), unquoteSqlValue(valueParts.join('='))];
    }),
  );
  const nextKey = typeof assignments.key === 'string' && assignments.key ? assignments.key : currentKey;
  let value = assignments.value;

  if (value === undefined) {
    value = (await storage.multiGet([currentKey]))[0]?.[1] ?? '';
  }

  await storage.setItem(nextKey, String(value ?? ''));

  if (nextKey !== currentKey) {
    await storage.removeItem(currentKey);
  }

  return { rows: [], rowsAffected: 1 };
};

const deleteRows = async (storage: AsyncStorageLike, sql: string): Promise<SqliteExecutionResult> => {
  const key = getWhereKey(sql);

  if (typeof key !== 'string' || !key) {
    throw new Error('DELETE precisa filtrar pela coluna key.');
  }

  await storage.removeItem(key);

  return { rows: [], rowsAffected: 1 };
};

const executeAsyncStorageSql = async (
  storage: AsyncStorageLike,
  { sql, params = [] }: ExecuteSqlParams,
): Promise<SqliteExecutionResult> => {
  const normalizedSql = normalizeSql(inlineBindings(sql, params));

  if (/^(begin|commit|rollback)(?:\s+transaction)?$/i.test(normalizedSql)) {
    return { rows: [], rowsAffected: 0 };
  }

  if (/^explain\s+query\s+plan\b/i.test(normalizedSql)) return { rows: [] };
  if (/^select\b/i.test(normalizedSql)) return selectRows(storage, normalizedSql);
  if (/^insert\b/i.test(normalizedSql)) return insertRows(storage, normalizedSql);
  if (/^update\b/i.test(normalizedSql)) return updateRows(storage, normalizedSql);
  if (/^delete\b/i.test(normalizedSql)) return deleteRows(storage, normalizedSql);

  throw new Error(UNSUPPORTED_SQL_ERROR);
};

export const createAsyncStorageAdapter = ({
  id,
  label,
  storage,
}: AsyncStorageAdapterParams): WoodboxBridgeAdapter => ({
  id,
  label,
  kind: 'sqlite',
  dialect: 'sqlite',
  model: 'relational',
  executeSql: (params) => executeAsyncStorageSql(storage, params),
});
