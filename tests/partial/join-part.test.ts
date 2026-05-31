import type { ValidateJoinPart } from "../../src/index.js";

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

// joined alias `o` resolves to orders; `o.id` valid, `b.id` (out-of-part) skipped
type J1 = Expect<Equal<ValidateJoinPart<"left join orders o on o.id = b.id", Schema>, true>>;

// `o.bad` is a real-but-wrong column on the joined table -> fail
type J2 = Expect<Equal<ValidateJoinPart<"left join orders o on o.bad = b.id", Schema>, false>>;

// typo'd joined table -> fail
type J3 = Expect<Equal<ValidateJoinPart<"left join ordrs o on o.id = b.id", Schema>, false>>;

// unaliased keyword form; `u.id` (out-of-part) skipped, `o.user_id` valid
type J4 = Expect<Equal<ValidateJoinPart<"join orders o on o.user_id = u.id", Schema>, true>>;
