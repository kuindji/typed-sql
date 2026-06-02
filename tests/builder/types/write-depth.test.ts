// tests/builder/types/write-depth.test.ts
import type { AssertEqual, RequireTrue } from "../../fixtures/helpers.js";
import type { ExtractParams, ExtractReturning } from "../../../src/builder/extract-params.js";
import type { WriteSchema, Team_id, User_id, Order_id } from "../fixtures/write-schema.js";

type W1 = ExtractParams<"insert into users (id, teamId, email, name, phone, status, age, score, verified, createdAt) values (:id, :team, :email, :name, :phone, :status, :age, :score, :verified, :created)", WriteSchema>;
type W2 = ExtractParams<"insert into orders (id, userId, productId, teamId, invoiceId, amount, currency, quantity, note, paid) values (:id, :uid, :pid, :team, :inv, :amt, :cur, :qty, :note, :paid)", WriteSchema>;
type W3 = ExtractParams<"update users set email = :email, name = :name, phone = :phone, status = :status, age = :age, score = :score, verified = :verified where id = :id and teamId = :team", WriteSchema>;
type W4 = ExtractParams<"update orders set amount = :amt, currency = :cur, quantity = :qty, note = :note, paid = :paid where userId = :uid and id = :oid", WriteSchema>;
type W6 = ExtractParams<"delete from orders where userId = :uid and currency = :cur and amount > :min and paid = :paid", WriteSchema>;
type W7 = ExtractReturning<"insert into orders (userId, amount, currency, quantity, note, paid) values (:uid, :amt, :cur, :qty, :note, :paid) returning id, userId, amount, currency, createdAt", WriteSchema>;

type _W1 = RequireTrue<AssertEqual<W1["team"], Team_id | null>>;
type _W2 = RequireTrue<AssertEqual<W2["uid"], User_id>>;
type _W3 = RequireTrue<AssertEqual<W3["team"], Team_id | null>>;
type _W4 = RequireTrue<AssertEqual<W4["oid"], Order_id>>;
type _W6 = RequireTrue<AssertEqual<W6["uid"], User_id>>;
type _W7 = RequireTrue<AssertEqual<W7["id"], Order_id>>;
