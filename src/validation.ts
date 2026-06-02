// Barrel for type-level SQL validation + result inference. Real declarations
// live in ./validation/*. Importers keep using `from "./validation.js"`.
export * from "./validation/dispatch.js";
export * from "./validation/joins.js";
export * from "./validation/return-types.js";
export * from "./validation/return-derived.js";
export * from "./validation/cte.js";
export * from "./validation/validate-columns.js";
