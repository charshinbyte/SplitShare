import { z } from "zod"; // Used for validiting types
import { randomUUID } from "crypto"; // Generates a random unique ID for a user
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const groupRouter = createTRPCRouter({
  create: publicProcedure
    .input(z.object({ name: z.string(), createdBy: z.string().uuid()}))
    .mutation(async ({input}) => {
        const id = randomUUID();
        const joined_at = new Date().toISOString();
        await db
            .insertInto("groups")
            .values({id, name: input.name, created_by: input.createdBy})
            .execute();

        await db
            .insertInto("group_members")
            .values({group_id: id, user_id: input.createdBy, joined_at})
            .execute();
        return {id, ...input };
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({input}) => {
        const expenses = await db
            .selectFrom('expenses')
            .select('id')
            .where('group_id', '=', input)
            .execute();
        const expenseIds = expenses.map((expense) => expense.id);

        if (expenseIds.length > 0) {
            await db
                .deleteFrom('expense_shares')
                .where('expense_id', 'in', expenseIds)
                .execute();
        }
        await db
            .deleteFrom('expenses')
            .where('group_id', '=', input)
            .execute()
        await db
            .deleteFrom('group_members')
            .where('group_id', '=', input)
            .execute()
        await db
            .deleteFrom('groups')
            .where('id', '=', input)
            .executeTakeFirst()
        return {id: input}
    }),


  updateByID: publicProcedure
    .input(z.object({id: z.string().uuid(), name: z.string()}))
    .mutation(async ({input}) => {
        await db
            .updateTable("groups")
            .set({name: input.name})
            .where("id", "=", input.id)
            .executeTakeFirst()
    }),


  getAll: publicProcedure.query(async () => {
        return db.selectFrom("groups").selectAll().execute();
    }),
  

  addUserToGroup: publicProcedure
    .input(z.object({ 
        group: z.string().uuid(),
        user: z.string().uuid()
    }))
    .mutation(async ({input}) => {
        const joined_at = new Date().toISOString();
        try {
            await db
                .insertInto("group_members")
                .values({group_id: input.group, user_id: input.user, joined_at })
                .execute();
        } catch (error) {
            if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "That user is already a member of this group.",
                });
            }
            throw error;
        }
        return {input, joined_at};
    }),


  deleteUserFromGroup: publicProcedure
    .input(z.object({
        group: z.string().uuid(),
        user: z.string().uuid()
    }))
    .mutation(async ({input}) => {
        const result = await db
            .deleteFrom("group_members")
            .where("group_id", "=", input.group)
            .where("user_id", "=", input.user)
            .executeTakeFirst();

        if (!result.numDeletedRows) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "That user is not a member of this group.",
            });
        }

        const paidExpenses = await db
            .selectFrom("expenses")
            .select("id")
            .where("group_id", "=", input.group)
            .where("paid_by", "=", input.user)
            .execute();
        const paidExpenseIds = paidExpenses.map((expense) => expense.id);

        if (paidExpenseIds.length > 0) {
            await db
                .deleteFrom("expense_shares")
                .where("expense_id", "in", paidExpenseIds)
                .execute();
            await db
                .deleteFrom("expenses")
                .where("id", "in", paidExpenseIds)
                .execute();
        }

        const groupExpenses = await db
            .selectFrom("expenses")
            .select("id")
            .where("group_id", "=", input.group)
            .execute();
        const groupExpenseIds = groupExpenses.map((expense) => expense.id);

        if (groupExpenseIds.length > 0) {
            await db
                .deleteFrom("expense_shares")
                .where("expense_id", "in", groupExpenseIds)
                .where("user_id", "=", input.user)
                .execute();
        }

        return input;
    }),

  getMembers: publicProcedure
    .input(z.string().uuid())
    .query(async ({input}) => {
        return db
            .selectFrom("group_members")
            .selectAll()
            .where("group_id", "=", input)
            .execute();
    }),
})
