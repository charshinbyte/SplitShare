import { z } from "zod"; // Used for validiting types
import { randomUUID } from "crypto"; // Generates a random unique ID for a user
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const expenseRouter = createTRPCRouter({
  createExpense: publicProcedure
    .input(z.object({
        group_id: z.string().uuid(),
        paid_by: z.string().uuid(),
        desc: z.string(),
        amount : z.number().positive(),
     }))
    .mutation(async ({input}) => {
        const membership = await db
            .selectFrom("group_members")
            .select("user_id")
            .where("group_id", "=", input.group_id)
            .where("user_id", "=", input.paid_by)
            .executeTakeFirst();
        if (!membership) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only members of this group can add expenses to it.",
            });
        }
        const id = randomUUID();
        const created_at = new Date().toISOString();
        await db
            .insertInto("expenses")
            .values({
                id: id, 
                group_id: input.group_id, 
                paid_by: input.paid_by,
                description: input.desc,
                amount: input.amount,
                created_at
             })
            .execute();
        return {id, ...input };
    }),

  getByGroup: publicProcedure
    .input(z.string().uuid())
    .query(async ({input}) => {
        return db
            .selectFrom("expenses")
            .selectAll()
            .where("group_id", "=", input)
            .execute();
    }),

  deleteExpense: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({input}) => {
        await db
            .deleteFrom("expense_shares")
            .where("expense_id", "=", input)
            .execute();
        await db
            .deleteFrom("expenses")
            .where("id", "=", input)
            .executeTakeFirst();
    }),

  updateExpense: publicProcedure
    .input(z.object({id: z.string().uuid(), desc: z.string(), amount: z.number().positive(), paid_by: z.string().uuid()}))
    .mutation(async ({input}) => {
        const expense = await db
            .selectFrom("expenses")
            .select(["group_id", "amount", "paid_by"])
            .where("id", "=", input.id)
            .executeTakeFirst();

        if (!expense) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Expense not found.",
            });
        }

        const membership = await db
            .selectFrom("group_members")
            .select("user_id")
            .where("group_id", "=", expense.group_id)
            .where("user_id", "=", input.paid_by)
            .executeTakeFirst();

        if (!membership) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only members of this group can be assigned as the payer.",
            });
        }

        await db.transaction().execute(async (trx) => {
            await trx
                .updateTable("expenses")
                .set({description: input.desc, amount: input.amount, paid_by: input.paid_by})
                .where("id", "=", input.id)
                .executeTakeFirst();

            if (input.amount !== expense.amount || input.paid_by !== expense.paid_by) {
                await trx
                    .deleteFrom("expense_shares")
                    .where("expense_id", "=", input.id)
                    .execute();
            }
        });
    }),

})

type PercentageShare = { userId: string; split: number }; 
type FloorShare = { userId: string; floor: number, remainder: number}; 

function getSplitShare(expense: number, share : PercentageShare[]) {
    const totalCents = Math.round(expense * 100);
    const floored = share.map((s) => {
        const amount = (totalCents * s.split) / 100;
        const floor = Math.floor(amount);
        return {
            userId: s.userId,
            floor,
            remainder: amount - floor,
        };
    });

    const flooredSum = floored.reduce((sum, f) => sum + f.floor, 0 );
    const remainder = totalCents - flooredSum;

    if (remainder != 0) {
        floored.sort((a, b) => b.remainder - a.remainder);
        for (let i = 0; i < remainder; i++) {
            const item = floored[i];
            if (item) {
                item.floor += 1;
            }
        }
    }
    return floored.map((share) => ({
        userId: share.userId,
        amount: share.floor / 100,
        remainder: share.remainder,
    }));
}


type Balance = { userId: string; amount: number };
type Transaction = { from: string; to: string; amount: number };

function minimizeTransactions(balances: Balance[]): Transaction[] {
    const transactions: Transaction[] = [];

    const bals = balances
        .filter(b => Math.abs(b.amount) > 0.001)
        .map(b => ({ ...b }));

    while (bals.length > 0) {
        bals.sort((a, b) => a.amount - b.amount);

        const debtor = bals[0];
        const creditor = bals[bals.length - 1];
        if (!debtor || !creditor) break;

        const settledAmount = Math.min(-debtor.amount, creditor.amount);

        transactions.push({
            from: debtor.userId,
            to: creditor.userId,
            amount: Math.round(settledAmount * 100) / 100,
        });

        debtor.amount += settledAmount;
        creditor.amount -= settledAmount;

        if (Math.abs(debtor.amount) < 0.001) bals.shift();
        if (Math.abs(creditor.amount) < 0.001) bals.pop();
    }
    return transactions;
}


const emptyToZero = (schema: z.ZodNumber) =>
    z.preprocess((val) => {
        if (val === "" || val === undefined || val === null) return 0;
        if (typeof val === "number" && Number.isNaN(val)) return 0;
        return val;
    }, schema);

export const expenseSharesRouter = createTRPCRouter({

  getByGroup: publicProcedure
    .input(z.string().uuid())
    .query(async ({input}) => {
        return db
            .selectFrom("expense_shares")
            .selectAll()
            .where("expense_id", "=", input)
            .execute();
    }),

  setShare : publicProcedure
    .input(
      z.discriminatedUnion("mode", [
        z.object({
          expenseId: z.string().uuid(),
          mode: z.literal("evenly"),
          shares: z.array(
            z.object({
              userId: z.string().uuid(),
            })
          ).min(1),
        }),

        z.object({
          expenseId: z.string().uuid(),
          mode: z.literal("exact"),
          shares: z.array(
            z.object({
              userId: z.string().uuid(),
              split: emptyToZero(z.number().nonnegative()),
            })
          ).min(1),
        }),

        z.object({
          expenseId: z.string().uuid(),
          mode: z.literal("percentage"),
          shares: z.array(
            z.object({
              userId: z.string().uuid(),
              split: emptyToZero(z.number().nonnegative().max(100)),
            })
          ).min(1),
        }),
      ])
    )
    .mutation(async ({input}) => {
        // Validate expense exists
        const expense = await db
            .selectFrom("expenses")
            .select(["id", "group_id", "amount"])
            .where("id", "=", input.expenseId)
            .executeTakeFirst();
        if (!expense) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Expense does not exist.",
            })}
        
        // Validate input members are in group
        const members = await db
            .selectFrom("group_members")
            .select("user_id")
            .where("group_id", "=", expense.group_id)
            .execute();
        
        const memberIds = new Set(members.map(m => m.user_id));  
        for (const share of input.shares) {
            if (!memberIds.has(share.userId)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `${share.userId} is not a member of this group.`,
                });
            }
        }
        // Validate no duplicate users
        const userIds = input.shares.map(
            share => share.userId
        );

        if (new Set(userIds).size !== userIds.length) {
            throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Duplicate users are not allowed.",
            });
        }

        // Share-amount validation
        let resolvedShares: {
            expense_id: string;
            user_id: string;
            amount_owed: number;
        }[] = [];


        if (input.mode === "exact") {
            const total = input.shares.reduce(
                (sum, share) => sum + share.split, 0
            );
            if (Math.abs(total - expense.amount) > 0.01) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Expense shares must add upto total sum`,
                });
            }

            resolvedShares = input.shares.map(share => ({
                expense_id: expense.id,
                user_id: share.userId,
                amount_owed: share.split}));

        }

        if (input.mode === "percentage") {
            const total = input.shares.reduce((sum, share) => sum + share.split, 0);
            if (Math.abs(total - 100) > 1e-4) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: 'percentage must add upto 100.'
                });
            }
            const splitShare = getSplitShare(expense.amount, input.shares.map(shares => ({userId: shares.userId, split: shares.split})) )
    
            resolvedShares = splitShare.map(share => ({
                expense_id: expense.id,
                user_id: share.userId,
                amount_owed: share.amount}));
        }

        if (input.mode === "evenly") {
            const evenPercentage = 100 / input.shares.length;

            const splitShare = getSplitShare(
                expense.amount,
                input.shares.map(share => ({ userId: share.userId, split: evenPercentage })),
            );

            resolvedShares = splitShare.map(share => ({
                expense_id: expense.id,
                user_id: share.userId,
                amount_owed: share.amount,
            }));
        }

        // Add to Database
        await db.transaction().execute(async (trx) => {
        await trx
            .deleteFrom("expense_shares")
            .where("expense_id", "=", expense.id)
            .execute();

        if (resolvedShares.length > 0) {
            await trx
                .insertInto("expense_shares")
                .values(resolvedShares)
                .execute();}
        });
        return resolvedShares;
    }),


   // Old redundant but good for reference 
  getBalance : publicProcedure
    .input(z.object({userId: z.string().uuid(), groupId: z.string().uuid()}))
    .query( async ({input}) => {
        const owes = await db
          .selectFrom('expense_shares')
          .innerJoin("expenses", "expenses.id", "expense_shares.expense_id")
          .select(["paid_by", "amount_owed"])
          .where("group_id", "=", input.groupId)
          .where("user_id", "=", input.userId)
          .execute();

        const totalOwed = owes.reduce((sum, share) => sum + share.amount_owed, 0);

        const paidRow = await db
          .selectFrom("expenses")
          .select(db.fn.sum<number>("amount").as("total"))
          .where("group_id", "=", input.groupId)
          .where("paid_by", "=", input.userId)
          .executeTakeFirst();
        const totalPaid = Number(paidRow?.total ?? 0);

        const settledPaidRow = await db
          .selectFrom("settlements")
          .select(db.fn.sum<number>("amount").as("total"))
          .where("group_id", "=", input.groupId)
          .where("paid_by", "=", input.userId)
          .executeTakeFirst();
        const totalSettledPaid = Number(settledPaidRow?.total ?? 0);

        const settledReceivedRow = await db
          .selectFrom("settlements")
          .select(db.fn.sum<number>("amount").as("total"))
          .where("group_id", "=", input.groupId)
          .where("paid_to", "=", input.userId)
          .executeTakeFirst();
        const totalSettledReceived = Number(settledReceivedRow?.total ?? 0);

        return {
          userId: input.userId,
          paid: totalPaid,
          owes: totalOwed,
          balance:
            totalPaid - totalOwed + totalSettledPaid - totalSettledReceived,
        };
    }),

  getSettlements: publicProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ input }) => {
        const owed = await db
            .selectFrom("expense_shares")
            .innerJoin("expenses", "expenses.id", "expense_shares.expense_id")
            .select(["user_id", db.fn.sum<number>("amount_owed").as("total")])
            .where("group_id", "=", input.groupId)
            .groupBy("user_id")
            .execute();

        const paid = await db
            .selectFrom("expenses")
            .select(["paid_by", db.fn.sum<number>("amount").as("total")])
            .where("group_id", "=", input.groupId)
            .groupBy("paid_by")
            .execute();

        const settledPaid = await db
            .selectFrom("settlements")
            .select(["paid_by", db.fn.sum<number>("amount").as("total")])
            .where("group_id", "=", input.groupId)
            .groupBy("paid_by")
            .execute();

        const settledReceived = await db
            .selectFrom("settlements")
            .select(["paid_to", db.fn.sum<number>("amount").as("total")])
            .where("group_id", "=", input.groupId)
            .groupBy("paid_to")
            .execute();

        const userIds = new Set([
            ...owed.map(r => r.user_id),
            ...paid.map(r => r.paid_by),
            ...settledPaid.map(r => r.paid_by),
            ...settledReceived.map(r => r.paid_to),
        ]);

        const balances = Array.from(userIds).map((userId) => {
            const totalOwed = Number(owed.find(r => r.user_id === userId)?.total ?? 0);
            const totalPaid = Number(paid.find(r => r.paid_by === userId)?.total ?? 0);
            const settPaid = Number(settledPaid.find(r => r.paid_by === userId)?.total ?? 0);
            const settReceived = Number(settledReceived.find(r => r.paid_to === userId)?.total ?? 0);
            return { userId, paid: totalPaid, owes: totalOwed, amount: totalPaid - totalOwed + settPaid - settReceived };
        });

        const transactions = minimizeTransactions(
            balances.map(b => ({ userId: b.userId, amount: b.amount }))
        );

        return { balances, transactions };
    }),

})


