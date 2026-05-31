import type { ValidateFromPart } from "../../src/index.js";

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

// valid table, with and without the leading `from`
type F1 = Expect<Equal<ValidateFromPart<"from users u", Schema>, true>>;
type F2 = Expect<Equal<ValidateFromPart<"users u", Schema>, true>>;

// typo'd table name fails (strict table existence)
type F3 = Expect<Equal<ValidateFromPart<"from userz u", Schema>, false>>;
