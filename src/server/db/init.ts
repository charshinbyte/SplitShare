import { db } from "./index";

async function main() {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("expenses")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("amount", "real", (col) => col.notNull())
    .addColumn("paid_by", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("expense_shares")
    .addColumn("expense_id", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("amount_owed", "real", (col) => col.notNull())
    .execute();

  console.log("Tables created!");
}

main();