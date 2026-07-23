import { z } from "zod";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const settlementRouter = createTRPCRouter({
  settleUp: publicProcedure
    .input(z.object({
        group_id: z.string().uuid(),
        paid_by: z.string().uuid(),
        paid_to: z.string().uuid(),
        amount: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
        if (input.paid_by === input.paid_to) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "You can't settle up with yourself.",
            });
        }
        const members = await db
            .selectFrom("group_members")
            .select("user_id")
            .where("group_id", "=", input.group_id)
            .where("user_id", "in", [input.paid_by, input.paid_to])
            .execute();

        if (members.length < 2) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Both users must be members of this group.",
            });
        }

        const id = randomUUID();
        const created_at = new Date().toISOString();
        await db
            .insertInto("settlements")
            .values({
                id,
                group_id: input.group_id,
                paid_by: input.paid_by,
                paid_to: input.paid_to,
                amount: input.amount,
                created_at,
            })
            .execute();

        return { id, ...input };
    }),

  getByGroup: publicProcedure
    .input(z.string().uuid())
    .query(async ({ input }) => {
        return db
            .selectFrom("settlements")
            .selectAll()
            .where("group_id", "=", input)
            .execute();
    }),

  deleteSettlement: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ input }) => {
        await db
            .deleteFrom("settlements")
            .where("id", "=", input)
            .executeTakeFirst();
    }),
});
