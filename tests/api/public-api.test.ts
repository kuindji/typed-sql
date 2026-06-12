import type { ValidateSQL, GetReturnType, DatabaseSchema } from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Expect<T extends true> = T;

type Schema = {
    defaultSchema: "public";
    schemas: {
        public: {
            my_table: {
                id: number;
                name: string;
                price: number;
                is_active: boolean;
            };
            users: {
                id: number;
                name: string;
            };
            posts: {
                id: number;
                user_id: number;
                title: string;
            };
        };
    };
};

// select *

type Q1 = "select * from my_table";

type T1 = Expect<Equal<ValidateSQL<Q1, Schema>, true>>;

type R1 = Expect<Equal<GetReturnType<Q1, Schema>, Schema["schemas"]["public"]["my_table"]>>;

// select columns

type Q2 = "select id, name from my_table";

type T2 = Expect<Equal<ValidateSQL<Q2, Schema>, true>>;

type R2 = Expect<Equal<GetReturnType<Q2, Schema>, { id: number; name: string }>>;

// functions and alias

type Q3 = "select count(*) as total, max(price) as max_price from my_table";

type T3 = Expect<Equal<ValidateSQL<Q3, Schema>, true>>;

// Ungrouped aggregates are NULL over zero rows — count alone never is.
type R3 = Expect<Equal<GetReturnType<Q3, Schema>, { total: number; max_price: number | null }>>;

// cast

type Q4 = "select price::text as price_text from my_table";

type T4 = Expect<Equal<ValidateSQL<Q4, Schema>, true>>;

type R4 = Expect<Equal<GetReturnType<Q4, Schema>, { price_text: string }>>;

// join + aliases

type Q5 = "select u.id as user_id, p.title from users u join posts p on p.user_id = u.id";

type T5 = Expect<Equal<ValidateSQL<Q5, Schema>, true>>;

type R5 = Expect<Equal<GetReturnType<Q5, Schema>, { user_id: number; title: string }>>;

// insert

type Q6 = "insert into my_table (id, name) values (1, 'a')";

type T6 = Expect<Equal<ValidateSQL<Q6, Schema>, true>>;

// update

type Q7 = "update my_table set name = 'x', price = price + 1 where id = 1";

type T7 = Expect<Equal<ValidateSQL<Q7, Schema>, true>>;

// delete returning

type Q8 = "delete from my_table returning id, name";

type T8 = Expect<Equal<ValidateSQL<Q8, Schema>, true>>;

type R8 = Expect<Equal<GetReturnType<Q8, Schema>, { id: number; name: string }>>;

// quoted identifiers

type Q9 = "select \"id\" from \"my_table\"";

type T9 = Expect<Equal<ValidateSQL<Q9, Schema>, true>>;

// backtick identifiers

type Q10 = "select `id` from `my_table`";

type T10 = Expect<Equal<ValidateSQL<Q10, Schema>, true>>;

// invalid column

type Q11 = "select nope from my_table";

type T11 = Expect<Equal<ValidateSQL<Q11, Schema>, false>>;

// invalid table

type Q12 = "select * from missing_table";

type T12 = Expect<Equal<ValidateSQL<Q12, Schema>, false>>;

// invalid insert column

type Q13 = "insert into my_table (unknown) values (1)";

type T13 = Expect<Equal<ValidateSQL<Q13, Schema>, false>>;

// plain runtime query string should be treated as invalid and produce empty result

type Q14 = string;

type T14 = Expect<Equal<ValidateSQL<Q14, Schema>, false>>;

type R14 = Expect<Equal<GetReturnType<Q14, Schema>, {}>>;

// runtime string fragment inside a query should be ignored

type Q15 = `select id, ${string} from my_table`;

type T15 = Expect<Equal<ValidateSQL<Q15, Schema>, true>>;

type R15 = Expect<Equal<GetReturnType<Q15, Schema>, { id: number }>>;
