// tests/builder/types/select-types.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { GetReturnType } from "../../../src/index.js";
import type { EcommerceSchema } from "../../fixtures/ecommerce-schema.js";
import { createSelectQuery } from "../../../src/builder/select.js";
import type { BuilderSQL, BuilderReturnType } from "../../../src/builder/return-type.js";

const b = createSelectQuery<EcommerceSchema>().from("Network_Order o").select("o.id", "s0");
type B = typeof b;

type _Sql = RequireTrue<AssertEqual<BuilderSQL<B>, "SELECT o.id FROM Network_Order o">>;
type _Row = RequireTrue<
    AssertEqual<
        BuilderReturnType<B>,
        GetReturnType<"SELECT o.id FROM Network_Order o", EcommerceSchema>
    >
>;
