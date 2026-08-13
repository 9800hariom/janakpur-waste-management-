'use server'

import DatabaseModule from "better-sqlite3";

function getSqliteDb() {
  const Database = (DatabaseModule as any).default || DatabaseModule;
  return new Database("sqlite.db");
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

export interface TableSummary {
  name: string;
  rowCount: number;
}

export async function getDatabaseTablesList(): Promise<TableSummary[]> {
  try {
    const sqlite = getSqliteDb();
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name ASC"
      )
      .all() as { name: string }[];

    const result: TableSummary[] = [];

    for (const t of tables) {
      try {
        const countRes = sqlite
          .prepare(`SELECT count(*) as count FROM "${t.name}"`)
          .get() as { count: number };
        result.push({ name: t.name, rowCount: countRes?.count || 0 });
      } catch (err) {
        result.push({ name: t.name, rowCount: 0 });
      }
    }

    sqlite.close();
    return result;
  } catch (error) {
    console.error("Error fetching database tables list:", error);
    return [];
  }
}

export async function getTableDetails(
  tableName: string,
  page: number = 1,
  pageSize: number = 15,
  searchQuery: string = ""
) {
  try {
    const sqlite = getSqliteDb();

    // Verify table exists to prevent SQL injection
    const validTable = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      )
      .get(tableName);

    if (!validTable) {
      sqlite.close();
      return { columns: [], rows: [], totalCount: 0, totalPages: 0 };
    }

    // Get column metadata using PRAGMA
    const columns = sqlite
      .prepare(`PRAGMA table_info("${tableName}")`)
      .all() as ColumnInfo[];

    const columnNames = columns.map((c) => c.name);

    let whereClause = "";
    let params: any[] = [];

    if (searchQuery.trim() && columnNames.length > 0) {
      const conditions = columnNames.map(
        (col) => `CAST("${col}" AS TEXT) LIKE ?`
      );
      whereClause = `WHERE ${conditions.join(" OR ")}`;
      params = columnNames.map(() => `%${searchQuery.trim()}%`);
    }

    const countSql = `SELECT count(*) as count FROM "${tableName}" ${whereClause}`;
    const totalCountRes = sqlite.prepare(countSql).get(...params) as {
      count: number;
    };
    const totalCount = totalCountRes?.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const offset = (page - 1) * pageSize;
    const dataSql = `SELECT * FROM "${tableName}" ${whereClause} LIMIT ? OFFSET ?`;
    const rows = sqlite.prepare(dataSql).all(...params, pageSize, offset);

    sqlite.close();

    return {
      columns,
      rows,
      totalCount,
      totalPages,
    };
  } catch (error) {
    console.error(`Error fetching data for table ${tableName}:`, error);
    return { columns: [], rows: [], totalCount: 0, totalPages: 0 };
  }
}
