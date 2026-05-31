import type {
    ValidateSelectPart,
    ValidateWherePart,
    ValidateHavingPart,
    ValidateGroupByPart,
    ValidateOrderByPart
} from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            users: { id: number; name: string };
            orders: { id: number; user_id: number; total: number };
        };
    };
};

// SELECT: alias-qualified + function are skipped; real-table refs validated
type S1 = Expect<Equal<ValidateSelectPart<"select t.id, count(*) as n", Schema>, true>>;
type S2 = Expect<Equal<ValidateSelectPart<"select users.id, users.name", Schema>, true>>;
type S3 = Expect<Equal<ValidateSelectPart<"select users.bad", Schema>, false>>;

// WHERE: out-of-part aliases skipped; real-table refs validated; bare col skipped
type W1 = Expect<Equal<ValidateWherePart<"where t.id = 5 and b.x > 0", Schema>, true>>;
type W2 = Expect<Equal<ValidateWherePart<"where users.id = 5", Schema>, true>>;
type W3 = Expect<Equal<ValidateWherePart<"where users.bad = 5", Schema>, false>>;
type W4 = Expect<Equal<ValidateWherePart<"where id = 5", Schema>, true>>;

// HAVING behaves like WHERE
type H1 = Expect<Equal<ValidateHavingPart<"having sum(total) > 0 and b.x > 0", Schema>, true>>;
type H2 = Expect<Equal<ValidateHavingPart<"having users.bad > 0", Schema>, false>>;

// GROUP BY / ORDER BY
type G1 = Expect<Equal<ValidateGroupByPart<"group by users.id", Schema>, true>>;
type O1 = Expect<Equal<ValidateOrderByPart<"order by t.id desc", Schema>, true>>;
type O2 = Expect<Equal<ValidateOrderByPart<"order by users.bad", Schema>, false>>;
