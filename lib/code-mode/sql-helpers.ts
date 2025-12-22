/**
 * SQL Query Builder Helpers for Code Mode
 *
 * These utilities make it easier for LLMs to construct correct SQL queries
 * for working with staged data in SQLite.
 */

export interface SQLQueryBuilder {
  table: string;
  select?: string[];
  where?: string[];
  groupBy?: string[];
  having?: string[];
  orderBy?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Build a SELECT query from structured parameters
 *
 * @example
 * buildSelectQuery({
 *   table: 'article',
 *   select: ['pmid', 'title', 'COUNT(*) as count'],
 *   where: ['pub_date >= "2023-01-01"', 'citation_count > 10'],
 *   groupBy: ['journal'],
 *   orderBy: ['count DESC'],
 *   limit: 20
 * })
 * // Returns: SELECT pmid, title, COUNT(*) as count FROM article WHERE pub_date >= "2023-01-01" AND citation_count > 10 GROUP BY journal ORDER BY count DESC LIMIT 20
 */
export function buildSelectQuery(builder: SQLQueryBuilder): string {
  const parts: string[] = [];

  // SELECT clause
  const selectClause = builder.select && builder.select.length > 0
    ? builder.select.join(', ')
    : '*';
  parts.push(`SELECT ${selectClause}`);

  // FROM clause
  parts.push(`FROM ${builder.table}`);

  // WHERE clause
  if (builder.where && builder.where.length > 0) {
    parts.push(`WHERE ${builder.where.join(' AND ')}`);
  }

  // GROUP BY clause
  if (builder.groupBy && builder.groupBy.length > 0) {
    parts.push(`GROUP BY ${builder.groupBy.join(', ')}`);
  }

  // HAVING clause
  if (builder.having && builder.having.length > 0) {
    parts.push(`HAVING ${builder.having.join(' AND ')}`);
  }

  // ORDER BY clause
  if (builder.orderBy && builder.orderBy.length > 0) {
    parts.push(`ORDER BY ${builder.orderBy.join(', ')}`);
  }

  // LIMIT clause
  if (builder.limit !== undefined && builder.limit > 0) {
    parts.push(`LIMIT ${builder.limit}`);
  }

  // OFFSET clause
  if (builder.offset !== undefined && builder.offset > 0) {
    parts.push(`OFFSET ${builder.offset}`);
  }

  return parts.join(' ');
}

/**
 * Common aggregation patterns for quick analysis
 */
export const aggregationPatterns = {
  /**
   * Count records by a field
   */
  countBy(table: string, field: string, options?: { limit?: number; minCount?: number }): string {
    const having = options?.minCount ? `HAVING count >= ${options.minCount}` : '';
    const limit = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT
        ${field},
        COUNT(*) as count
      FROM ${table}
      WHERE ${field} IS NOT NULL
      GROUP BY ${field}
      ${having}
      ORDER BY count DESC
      ${limit}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Get top N records by a score/count field
   */
  topN(table: string, scoreField: string, n: number, selectFields?: string[]): string {
    const fields = selectFields ? selectFields.join(', ') : '*';

    return `
      SELECT ${fields}
      FROM ${table}
      WHERE ${scoreField} IS NOT NULL
      ORDER BY ${scoreField} DESC
      LIMIT ${n}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Temporal analysis - group by time period
   */
  temporal(table: string, dateField: string, period: 'year' | 'month' | 'day' = 'month', options?: { minDate?: string; maxDate?: string }): string {
    const formatMap = {
      year: '%Y',
      month: '%Y-%m',
      day: '%Y-%m-%d'
    };

    const whereConditions: string[] = [`${dateField} IS NOT NULL`];
    if (options?.minDate) whereConditions.push(`${dateField} >= '${options.minDate}'`);
    if (options?.maxDate) whereConditions.push(`${dateField} <= '${options.maxDate}'`);

    return `
      SELECT
        strftime('${formatMap[period]}', ${dateField}) as period,
        COUNT(*) as count
      FROM ${table}
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY period
      ORDER BY period DESC
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Statistical summary of a numeric field
   */
  statistics(table: string, numericField: string, options?: { where?: string }): string {
    const whereClause = options?.where ? `WHERE ${options.where}` : '';

    return `
      SELECT
        COUNT(*) as count,
        AVG(CAST(${numericField} AS REAL)) as avg,
        MIN(CAST(${numericField} AS REAL)) as min,
        MAX(CAST(${numericField} AS REAL)) as max,
        SUM(CAST(${numericField} AS REAL)) as sum
      FROM ${table}
      ${whereClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Find distinct values in a field
   */
  distinctValues(table: string, field: string, options?: { limit?: number; where?: string }): string {
    const whereClause = options?.where ? `WHERE ${options.where}` : '';
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT DISTINCT ${field}
      FROM ${table}
      ${whereClause}
      ORDER BY ${field}
      ${limitClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Paginated results with offset
   */
  paginate(table: string, page: number, pageSize: number, options?: { orderBy?: string; where?: string }): string {
    const offset = (page - 1) * pageSize;
    const whereClause = options?.where ? `WHERE ${options.where}` : '';
    const orderClause = options?.orderBy ? `ORDER BY ${options.orderBy}` : '';

    return `
      SELECT *
      FROM ${table}
      ${whereClause}
      ${orderClause}
      LIMIT ${pageSize}
      OFFSET ${offset}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Search for text in a field
   */
  textSearch(table: string, field: string, searchTerm: string, options?: { caseInsensitive?: boolean; limit?: number }): string {
    const operator = options?.caseInsensitive !== false ? 'LIKE' : '=';
    const pattern = options?.caseInsensitive !== false ? `%${searchTerm}%` : searchTerm;
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT *
      FROM ${table}
      WHERE ${field} ${operator} '${pattern.replace(/'/g, "''")}'
      ${limitClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Multi-field search
   */
  multiFieldSearch(table: string, fields: string[], searchTerm: string, options?: { limit?: number }): string {
    const pattern = `%${searchTerm}%`;
    const conditions = fields.map(f => `${f} LIKE '${pattern.replace(/'/g, "''")}'`).join(' OR ');
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT *
      FROM ${table}
      WHERE ${conditions}
      ${limitClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Ranking with percentiles
   */
  rankBy(table: string, rankField: string, options?: { limit?: number; selectFields?: string[] }): string {
    const fields = options?.selectFields ? options.selectFields.join(', ') + ', ' : '';
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT
        ${fields}${rankField},
        ROW_NUMBER() OVER (ORDER BY ${rankField} DESC) as rank,
        PERCENT_RANK() OVER (ORDER BY ${rankField}) as percentile
      FROM ${table}
      WHERE ${rankField} IS NOT NULL
      ORDER BY rank
      ${limitClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Find records with missing/null values
   */
  findNulls(table: string, fields: string[], options?: { limit?: number }): string {
    const conditions = fields.map(f => `${f} IS NULL`).join(' OR ');
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    return `
      SELECT *
      FROM ${table}
      WHERE ${conditions}
      ${limitClause}
    `.trim().replace(/\s+/g, ' ');
  },

  /**
   * Cross-tabulation (pivot table style)
   */
  crosstab(table: string, rowField: string, colField: string, aggregateField?: string): string {
    const agg = aggregateField ? `SUM(${aggregateField})` : 'COUNT(*)';

    return `
      SELECT
        ${rowField},
        ${colField},
        ${agg} as value
      FROM ${table}
      WHERE ${rowField} IS NOT NULL AND ${colField} IS NOT NULL
      GROUP BY ${rowField}, ${colField}
      ORDER BY ${rowField}, ${colField}
    `.trim().replace(/\s+/g, ' ');
  }
};

/**
 * Helper to escape SQL string literals
 */
export function escapeSQLString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Helper to build WHERE conditions with AND/OR
 */
export function buildWhereClause(conditions: Array<string | { or: string[] } | { and: string[] }>): string {
  const parts = conditions.map(cond => {
    if (typeof cond === 'string') return cond;
    if ('or' in cond) return `(${cond.or.join(' OR ')})`;
    if ('and' in cond) return `(${cond.and.join(' AND ')})`;
    return '';
  }).filter(Boolean);

  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

/**
 * Generate documentation for SQL helpers as a string
 * This can be included in the system prompt for Code Mode
 */
export function generateSQLHelperDocs(): string {
  return `
## SQL Query Helpers for Staged Data

When working with staged data, use these SQL helper functions for common patterns:

### Quick Aggregations

\`\`\`javascript
// Count records by field
const byJournal = helpers.sql.countBy('article', 'journal', { limit: 20, minCount: 5 });
// SELECT journal, COUNT(*) as count FROM article WHERE journal IS NOT NULL GROUP BY journal HAVING count >= 5 ORDER BY count DESC LIMIT 20

// Get top N by score
const topPapers = helpers.sql.topN('article', 'citation_count', 50, ['pmid', 'title', 'journal']);
// SELECT pmid, title, journal FROM article WHERE citation_count IS NOT NULL ORDER BY citation_count DESC LIMIT 50

// Temporal analysis
const byMonth = helpers.sql.temporal('article', 'pub_date', 'month', { minDate: '2023-01-01' });
// SELECT strftime('%Y-%m', pub_date) as period, COUNT(*) as count FROM article WHERE pub_date IS NOT NULL AND pub_date >= '2023-01-01' GROUP BY period ORDER BY period DESC

// Statistical summary
const stats = helpers.sql.statistics('article', 'citation_count');
// SELECT COUNT(*) as count, AVG(CAST(citation_count AS REAL)) as avg, MIN(...) as min, MAX(...) as max FROM article
\`\`\`

### Text Search

\`\`\`javascript
// Single field search
const found = helpers.sql.textSearch('article', 'abstract', 'CRISPR', { limit: 100 });
// SELECT * FROM article WHERE abstract LIKE '%CRISPR%' LIMIT 100

// Multi-field search
const results = helpers.sql.multiFieldSearch('article', ['title', 'abstract', 'keywords'], 'immunotherapy', { limit: 200 });
// SELECT * FROM article WHERE title LIKE '%immunotherapy%' OR abstract LIKE '%immunotherapy%' OR keywords LIKE '%immunotherapy%' LIMIT 200
\`\`\`

### Ranking and Analysis

\`\`\`javascript
// Rank with percentiles
const ranked = helpers.sql.rankBy('article', 'citation_count', { limit: 100, selectFields: ['pmid', 'title'] });
// SELECT pmid, title, citation_count, ROW_NUMBER() OVER (ORDER BY citation_count DESC) as rank, PERCENT_RANK() OVER (ORDER BY citation_count) as percentile FROM article WHERE citation_count IS NOT NULL ORDER BY rank LIMIT 100
\`\`\`

### Advanced Patterns

\`\`\`javascript
// Build custom query
const query = helpers.sql.buildSelectQuery({
  table: 'article',
  select: ['journal', 'COUNT(*) as count', 'AVG(citation_count) as avg_citations'],
  where: ['pub_date >= "2023-01-01"', 'citation_count > 10'],
  groupBy: ['journal'],
  having: ['count >= 5'],
  orderBy: ['avg_citations DESC'],
  limit: 20
});
// Generates complete SELECT query with all clauses
\`\`\`

**Benefits:**
- Reduces SQL syntax errors
- Ensures proper escaping and formatting
- Provides consistent patterns across queries
- Makes code more readable and maintainable
`.trim();
}

/**
 * Runtime implementation that gets injected into the Code Mode environment
 * This provides the actual SQL helper functions that the LLM can use
 */
export function generateSQLHelpersImplementation(): string {
  return `
// SQL Query Helpers
const sql = {
  buildSelectQuery: ${buildSelectQuery.toString()},

  countBy: function(table, field, options = {}) {
    const having = options.minCount ? \`HAVING count >= \${options.minCount}\` : '';
    const limit = options.limit ? \`LIMIT \${options.limit}\` : '';
    return \`SELECT \${field}, COUNT(*) as count FROM \${table} WHERE \${field} IS NOT NULL GROUP BY \${field} \${having} ORDER BY count DESC \${limit}\`.trim().replace(/\\s+/g, ' ');
  },

  topN: function(table, scoreField, n, selectFields) {
    const fields = selectFields ? selectFields.join(', ') : '*';
    return \`SELECT \${fields} FROM \${table} WHERE \${scoreField} IS NOT NULL ORDER BY \${scoreField} DESC LIMIT \${n}\`.trim().replace(/\\s+/g, ' ');
  },

  temporal: function(table, dateField, period = 'month', options = {}) {
    const formatMap = { year: '%Y', month: '%Y-%m', day: '%Y-%m-%d' };
    const whereConditions = [\`\${dateField} IS NOT NULL\`];
    if (options.minDate) whereConditions.push(\`\${dateField} >= '\${options.minDate}'\`);
    if (options.maxDate) whereConditions.push(\`\${dateField} <= '\${options.maxDate}'\`);
    return \`SELECT strftime('\${formatMap[period]}', \${dateField}) as period, COUNT(*) as count FROM \${table} WHERE \${whereConditions.join(' AND ')} GROUP BY period ORDER BY period DESC\`.trim().replace(/\\s+/g, ' ');
  },

  statistics: function(table, numericField, options = {}) {
    const whereClause = options.where ? \`WHERE \${options.where}\` : '';
    return \`SELECT COUNT(*) as count, AVG(CAST(\${numericField} AS REAL)) as avg, MIN(CAST(\${numericField} AS REAL)) as min, MAX(CAST(\${numericField} AS REAL)) as max, SUM(CAST(\${numericField} AS REAL)) as sum FROM \${table} \${whereClause}\`.trim().replace(/\\s+/g, ' ');
  },

  textSearch: function(table, field, searchTerm, options = {}) {
    const pattern = \`%\${searchTerm}%\`;
    const limitClause = options.limit ? \`LIMIT \${options.limit}\` : '';
    return \`SELECT * FROM \${table} WHERE \${field} LIKE '\${pattern.replace(/'/g, "''")}' \${limitClause}\`.trim().replace(/\\s+/g, ' ');
  },

  multiFieldSearch: function(table, fields, searchTerm, options = {}) {
    const pattern = \`%\${searchTerm}%\`;
    const conditions = fields.map(f => \`\${f} LIKE '\${pattern.replace(/'/g, "''")}'\`).join(' OR ');
    const limitClause = options.limit ? \`LIMIT \${options.limit}\` : '';
    return \`SELECT * FROM \${table} WHERE \${conditions} \${limitClause}\`.trim().replace(/\\s+/g, ' ');
  },

  paginate: function(table, page, pageSize, options = {}) {
    const offset = (page - 1) * pageSize;
    const whereClause = options.where ? \`WHERE \${options.where}\` : '';
    const orderClause = options.orderBy ? \`ORDER BY \${options.orderBy}\` : '';
    return \`SELECT * FROM \${table} \${whereClause} \${orderClause} LIMIT \${pageSize} OFFSET \${offset}\`.trim().replace(/\\s+/g, ' ');
  },

  rankBy: function(table, rankField, options = {}) {
    const fields = options.selectFields ? options.selectFields.join(', ') + ', ' : '';
    const limitClause = options.limit ? \`LIMIT \${options.limit}\` : '';
    return \`SELECT \${fields}\${rankField}, ROW_NUMBER() OVER (ORDER BY \${rankField} DESC) as rank, PERCENT_RANK() OVER (ORDER BY \${rankField}) as percentile FROM \${table} WHERE \${rankField} IS NOT NULL ORDER BY rank \${limitClause}\`.trim().replace(/\\s+/g, ' ');
  },

  distinctValues: function(table, field, options = {}) {
    const whereClause = options.where ? \`WHERE \${options.where}\` : '';
    const limitClause = options.limit ? \`LIMIT \${options.limit}\` : '';
    return \`SELECT DISTINCT \${field} FROM \${table} \${whereClause} ORDER BY \${field} \${limitClause}\`.trim().replace(/\\s+/g, ' ');
  },

  escapeSQLString: function(str) {
    return str.replace(/'/g, "''");
  }
};

// Make sql helpers globally available
globalThis.sql = sql;
`.trim();
}
