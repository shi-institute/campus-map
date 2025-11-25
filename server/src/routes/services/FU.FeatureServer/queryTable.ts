// import { Knex } from 'knex';
// import { Query } from 'mingo';
// import { parse } from 'pgsql-parser';
// import { kartKnex } from '../../../utils/kartDatabasePool.js';

// interface WhereCondition {}

// export function queryTable(tableName: string, query: query.Filter) {
//   const filter = parseFilter(query);
// }

// // special type that only allows one property
// type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
//   ? I
//   : never;
// type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;
// type SingleKey<K extends string, T> = IsUnion<K> extends true
//   ? 'Can only contain a single key'
//   : Record<K, T>;

// declare namespace query {
//   // logical operators
//   type AND = { $and: Condition[] };
//   type OR = { $or: Condition[] };

//   // filter operators
//   type EQ = { $eq: string | number };
//   type NEQ = { $ne: string | number };
//   type GT = { $gt: number };
//   type GTE = { $gte: number };
//   type LT = { $lt: number };
//   type LTE = { $lte: number };
//   type IN = { $in: Array<string | number> };

//   // types for any operator
//   type Condition = AND | OR | EQ | NEQ | GT | GTE | LT | LTE | IN;
//   type Operator = KeysOfUnion<Condition>;

//   type KeysOfUnion<T> = T extends unknown ? keyof T : never;
//   type ValueOfUnion<T> = T extends unknown ? T[keyof T] : never;

//   // type for a valid input filter
//   type Filter =
//     | SingleKey<'$and', Filter[]>
//     | SingleKey<'$or', Filter[]>
//     | Record<Exclude<string, '$and' | '$or'>, Condition>;

//   // parsed operators are expanded to always include their field, operator, and comparison value
//   type ParsedOperator<T = Condition> = {
//     field: string;
//     op: T;
//     value: unknown;
//   };

//   // resolved types for AND and OR that contain parsed operators
//   type ResolvedAND = SingleKey<'$and', (ParsedOperator<Operator> | ResolvedAND | ResolvedOR)[] | undefined>;
//   type ResolvedOR = SingleKey<'$or', (ParsedOperator<Operator> | ResolvedAND | ResolvedOR)[] | undefined>;

//   // resolved filters always expand to parsed operators and nested logical operators
//   type ResolvedFilter = ResolvedAND & ResolvedOR;
// }

// function isQueryOperator(toCheck: unknown): toCheck is query.Operator {
//   return isLogicalOperator(toCheck) || isFilterOperator(toCheck);
// }

// function isLogicalOperator(toCheck: unknown): toCheck is '$and' | '$or' {
//   const logicalOperators: Set<string> = new Set(['$and', '$or']);
//   return typeof toCheck === 'string' && logicalOperators.has(toCheck);
// }

// function isFilterOperator(toCheck: unknown): toCheck is Exclude<query.Operator, '$and' | '$or'> {
//   const filterOperators: Set<string> = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in']);
//   return typeof toCheck === 'string' && filterOperators.has(toCheck);
// }

// function isCondition(toCheck: unknown): toCheck is query.Condition {
//   if (typeof toCheck !== 'object' || toCheck === null) {
//     return false;
//   }
//   const keys = Object.keys(toCheck);
//   if (keys.length !== 1) {
//     return false;
//   }
//   const key = keys[0];
//   return isQueryOperator(key);
// }

// function isParsedOperator(toCheck: unknown): toCheck is query.ParsedOperator {
//   if (typeof toCheck !== 'object' || toCheck === null) {
//     return false;
//   }
//   const hasField = 'field' in toCheck && typeof (toCheck as any).field === 'string';
//   const hasOp = 'op' in toCheck && isQueryOperator((toCheck as any).op);
//   const hasValue = 'value' in toCheck;
//   return hasField && hasOp && hasValue;
// }

// function getConditions(filter: query.Filter): [Exclude<string, '$and' | '$or'>, query.Condition][] {
//   const entries: [Exclude<string, '$and' | '$or'>, query.Condition][] = [];

//   for (const [key, value] of Object.entries(filter)) {
//     // ensure non-logical operator key
//     if (isLogicalOperator(key)) {
//       continue;
//     }

//     // some inputs may have multiple conditions under a single key (implicit AND/OR)
//     // so we check each individual key-value pair
//     if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
//       for (const [subKey, subValue] of Object.entries(value)) {
//         if (isCondition({ [subKey]: subValue })) {
//           entries.push([key, { [subKey]: subValue } as query.Condition]);
//         }
//       }
//     }
//   }

//   return entries;
// }

// function isOperator(toCheck: unknown): toCheck is `$${string}` {
//   return typeof toCheck === 'string' && toCheck.startsWith('$');
// }

// function parseFilter(
//   filter: query.Filter,
//   __depth = 0,
//   implicitType: '$and' | '$or' = '$and'
// ): query.ResolvedFilter | null {
//   if (typeof filter !== 'object' || filter === null) {
//     throw new Error('Invalid filter: must be a non-null object');
//   }

//   if (__depth > 2) {
//     return null;
//   }

//   // disallow top-level keys that start with $ unless they are $and or $or
//   if (__depth === 0) {
//     const keys = Object.keys(filter);
//     for (const key of keys) {
//       if (isOperator(key) && !isLogicalOperator(key)) {
//         throw new Error(`Invalid filter: top-level key "${key}" is not allowed`);
//       }
//     }
//   }

//   // extract the $and and $or arrays
//   const $and = '$and' in filter ? (filter['$and'] as query.Filter[]) : [];
//   const $or = '$or' in filter ? (filter['$or'] as query.Filter[]) : [];

//   // parse the filter operators
//   const parsedOperators: query.ParsedOperator<query.Operator>[] = [];
//   for (const [field, condition] of getConditions(filter)) {
//     // if the condition is a logical operator, add it to the appropriate array
//     if ('$and' in condition) {
//       condition.$and.forEach((subCondition) => {
//         $and.push({ [field]: subCondition } as query.Filter);
//       });
//       continue;
//     }
//     if ('$or' in condition) {
//       condition.$or.forEach((subCondition) => {
//         $or.push({ [field]: subCondition } as query.Filter);
//       });
//       continue;
//     }

//     // otherwise, it must be a filter operator
//     parsedOperators.push({
//       field,
//       op: Object.keys(condition)[0] as query.Operator,
//       value: Object.values(condition)[0],
//     });
//   }

//   // resolve the $and and $or conditions
//   const resolvedAnd = $and
//     .map((subFilter) => parseFilter(subFilter, __depth + 1, '$and'))
//     .filter((x) => !!x)
//     .flatMap((x) => {
//       // collapse nested $and conditions since th
//       return x ? ('$and' in x && Object.keys(x).length === 1 ? x.$and || [] : [x]) : [];
//     });
//   const resolvedOr = $or
//     .map((subFilter) => parseFilter(subFilter, __depth + 1, '$or'))
//     .filter((x) => !!x)
//     .flatMap((x) => {
//       // collapse nested $or conditions since th
//       return x ? ('$or' in x && Object.keys(x).length === 1 ? x.$or || [] : [x]) : [];
//     });

//   // assign the parsed operators to the appropriate logical operator
//   if (implicitType === '$and') {
//     resolvedAnd.push(...parsedOperators);
//   } else if (implicitType === '$or') {
//     resolvedOr.push(...parsedOperators);
//   }

//   // construct the resolved filter
//   const result: query.ResolvedFilter = {
//     $and: resolvedAnd,
//     $or: resolvedOr,
//   };
//   if ('$and' in result && result.$and?.length === 0) {
//     delete result.$and;
//   }
//   if ('$or' in result && result.$or?.length === 0) {
//     delete result.$or;
//   }
//   if (!('$and' in result) && !('$or' in result)) {
//     return null;
//   }

//   return result;
// }

// const operatorMap: Record<query.Operator, string> = {
//   $eq: '=',
//   $ne: '!=',
//   $gt: '>',
//   $gte: '>=',
//   $lt: '<',
//   $lte: '<=',
//   $in: 'in',
//   $and: 'and',
//   $or: 'or',
// };

// export function applyResolvedFilter(
//   qb: Knex.QueryBuilder,
//   filter: query.ResolvedFilter,
//   logical: 'and' | 'or' = 'and'
// ): void {
//   if (filter.$and?.length) {
//     const method = logical === 'and' ? 'andWhere' : 'orWhere';
//     qb[method]((subQb) => {
//       for (const item of filter.$and!) {
//         if (isParsedOperator(item)) {
//           const t = item;
//           handleCondition(subQb, item, 'and');
//         }
//       }
//     });
//   }

//   if (filter.$or?.length) {
//     const method = logical === 'and' ? 'andWhere' : 'orWhere';
//     qb[method]((subQb) => {
//       for (const item of filter.$or!) {
//         handleCondition(subQb, item, 'or');
//       }
//     });
//   }
// }

// function handleCondition(
//   qb: Knex.QueryBuilder,
//   cond: query.ParsedOperator<query.Operator> | query.ResolvedFilter,
//   logical: 'and' | 'or'
// ): void {
//   if ('$and' in cond || '$or' in cond) {
//     applyResolvedFilter(qb, cond as query.ResolvedFilter, logical);
//     return;
//   }

//   const { field, op, value } = cond;
//   const sqlOp = operatorMap[op];
//   if (sqlOp === 'in') {
//     logical === 'and' ? qb.whereIn(field, value as any[]) : qb.orWhereIn(field, value as any[]);
//   } else {
//     logical === 'and' ? qb.where(field, sqlOp, value as any) : qb.orWhere(field, sqlOp, value as any);
//   }
// }

// const myFilter: query.Filter = {
//   hi: { $eq: 'hello' },
//   $and: [{ age: { $gte: 18 } }, { status: { $eq: 'active' } }],
//   bye: {
//     $and: [{ $in: [1, 2, 3] }],
//   },
// };

// const myFilter2: query.Filter = {
//   $and: [{ age: { $gte: 18 } }, { status: { $eq: 'active' } }],
//   hi: {
//     $gte: 5,
//     $lte: 10,
//   },
//   role: { $or: [{ $eq: 'admin' }, { $eq: 'admin2' }] },

//   $or: [
//     { role: { $or: [{ $eq: 'admin' }, { $eq: 'admin2' }] } },
//     { role: { $eq: 'admin2' } },
//     {
//       $and: [{ status: { $eq: 'pending' } }, { age: { $lt: 30 } }],
//     },
//   ],
// };

// const parsedFilter2 = parseFilter(myFilter2);
// console.log('Parsed Filter 2:');
// if (parsedFilter2) {
//   console.log(JSON.stringify(parsedFilter2, null, 2));
//   const q = kartKnex('users');
//   applyResolvedFilter(q, parsedFilter2);
//   console.log(q.toQuery());
// }

// // wait 30 seconds
// await new Promise((resolve) => setTimeout(resolve, 30000));

// // export interface ParsedCondition {
// //   field: string;
// //   op: QueryOperator;
// //   value: string | number | Array<string | number>;
// // }

// // export function parseFilter(filter: Filter): ParsedCondition[] {
// //   const result: ParsedCondition[] = [];

// //   for (const [field, condition] of Object.entries(filter)) {
// //     if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
// //       for (const [op, value] of Object.entries(condition)) {
// //         result.push({ field, op, value });
// //       }
// //     } else {
// //       result.push({ field, op: "$eq", value: condition });
// //     }
// //   }
// //   return result;
// // }
