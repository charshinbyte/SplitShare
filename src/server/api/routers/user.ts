import { z } from "zod"; // Used for validiting types
import { randomUUID } from "crypto"; // Generates a random unique ID for a user
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const userRouter = createTRPCRouter({
  create: publicProcedure
    .input(z.object({ name: z.string(), email: z.string().email() }))
    .mutation(async ({input }) => {
        const id = randomUUID();
        await db
            .insertInto("users")
            .values({id, name: input.name, email:input.email })
            .execute();
        return {id, ...input };
    }),

    getAll: publicProcedure.query(async () => {
        return db.selectFrom("users").selectAll().execute();
    }),

  userByID: publicProcedure
    .input(z.string().uuid())
    .query(async ({input}) =>{
        return db
        .selectFrom("users")
        .selectAll()
        .where("id","=", input)
        .executeTakeFirst();
    }),

  updateByID: publicProcedure
    .input(z.object({id: z.string().uuid(), name: z.string(), email: z.string().email()}))
    .mutation(async ({input}) => {
        await db
            .updateTable("users")
            .set({name: input.name, email: input.email})
            .where("id", "=", input.id)
            .executeTakeFirst()
    }),

  deleteByID: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({input}) => {
        const expenses = await db
            .selectFrom('expenses')
            .select('id')
            .where('paid_by', '=', input)
            .execute();
        const expenseIds = expenses.map((expense) => expense.id);

        await db
            .deleteFrom('expense_shares')
            .where('user_id', '=', input)
            .execute()
        if (expenseIds.length > 0) {
            await db
                .deleteFrom('expense_shares')
                .where('expense_id', 'in', expenseIds)
                .execute();
        }
        await db
            .deleteFrom('expenses')
            .where('paid_by', '=', input)
            .execute()
        await db
            .deleteFrom('group_members')
            .where('user_id', '=', input)
            .execute()
        await db
            .deleteFrom('users')
            .where('id', '=', input)
            .executeTakeFirst()
        return {id: input}
    })

})
