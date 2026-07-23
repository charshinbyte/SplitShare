import { randomUUID } from "crypto";
import { db } from "./index";

async function main() {
  const users = [
    { id: randomUUID(), name: "Alice", email: "alice@example.com" },
    { id: randomUUID(), name: "Bob", email: "bob@example.com" },
    { id: randomUUID(), name: "Charlie", email: "charlie@example.com" },
    { id: randomUUID(), name: "Dana", email: "dana@example.com" },
  ];
  await db.insertInto("users").values(users).execute();
  const [alice, bob, charlie, dana] = users;

  const groups = [
    { id: randomUUID(), name: "Cabin Trip", created_by: alice!.id },
    { id: randomUUID(), name: "Apartment", created_by: bob!.id },
  ];
  await db.insertInto("groups").values(groups).execute();
  const [cabinTrip, apartment] = groups;

  await db
    .insertInto("group_members")
    .values([
      { group_id: cabinTrip!.id, user_id: alice!.id },
      { group_id: cabinTrip!.id, user_id: bob!.id },
      { group_id: cabinTrip!.id, user_id: charlie!.id },
      { group_id: apartment!.id, user_id: bob!.id },
      { group_id: apartment!.id, user_id: dana!.id },
    ])
    .execute();

  const expenses = [
    {
      id: randomUUID(),
      group_id: cabinTrip!.id,
      paid_by: alice!.id,
      description: "Groceries",
      amount: 90,
    },
    {
      id: randomUUID(),
      group_id: cabinTrip!.id,
      paid_by: bob!.id,
      description: "Gas",
      amount: 45,
    },
    {
      id: randomUUID(),
      group_id: apartment!.id,
      paid_by: dana!.id,
      description: "Electric bill",
      amount: 120,
    },
  ];
  await db.insertInto("expenses").values(expenses).execute();
  const [groceries, gas, electric] = expenses;

  // Groceries: split evenly, Alice/Bob/Charlie
  await db
    .insertInto("expense_shares")
    .values([
      { expense_id: groceries!.id, user_id: alice!.id, amount_owed: 30 },
      { expense_id: groceries!.id, user_id: bob!.id, amount_owed: 30 },
      { expense_id: groceries!.id, user_id: charlie!.id, amount_owed: 30 },

      // Gas: split evenly, Alice/Bob/Charlie
      { expense_id: gas!.id, user_id: alice!.id, amount_owed: 15 },
      { expense_id: gas!.id, user_id: bob!.id, amount_owed: 15 },
      { expense_id: gas!.id, user_id: charlie!.id, amount_owed: 15 },

      // Electric bill: split evenly, Bob/Dana
      { expense_id: electric!.id, user_id: bob!.id, amount_owed: 60 },
      { expense_id: electric!.id, user_id: dana!.id, amount_owed: 60 },
    ])
    .execute();

  console.log("Seed data inserted!");
}

void main();
