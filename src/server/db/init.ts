import { sql } from "kysely";
import { db } from "./index";

async function main() {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .execute();

await db.schema
    .createTable("groups")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_by", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("group_members")
    .addColumn("group_id", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("joined_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("group_members_unique_membership")
    .on("group_members")
    .columns(["group_id", "user_id"])
    .unique()
    .execute();

  await db.schema
    .createTable("expenses")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("group_id", "text", (col) => col.notNull())
    .addColumn("paid_by", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("amount", "real", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("expense_shares")
    .addColumn("expense_id", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("amount_owed", "real", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("expense_shares_unique_share")
    .on("expense_shares")
    .columns(["expense_id", "user_id"])
    .unique()
    .execute();

  await db.schema
    .createTable("settlements")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("group_id", "text", (col) => col.notNull())
    .addColumn("paid_by", "text", (col) => col.notNull())
    .addColumn("paid_to", "text", (col) => col.notNull())
    .addColumn("amount", "real", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  console.log("Tables created!");
}

void main();