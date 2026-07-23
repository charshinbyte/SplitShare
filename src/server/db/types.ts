import type { Generated, ColumnType } from "kysely";


export interface Database {
    users: {
        id : Generated<string>;
        name : string;
        email : string;
    };

    groups: {
        id : Generated<string>;
        name : string;
        created_by: string; // Corresponds to user.id
    };

    group_members: {
        group_id : string;
        user_id : string;
        joined_at : ColumnType<Date, string | undefined, never>;
    };

    expenses: {
        id : Generated<string>;
        group_id : string;
        paid_by: string;
        description : string;
        amount : number;
        created_at : ColumnType<Date, string | undefined, never>;
    }

    expense_shares: {
        expense_id : string;
        user_id : string;
        amount_owed: number;
    }

    settlements: {
        id : Generated<string>;
        group_id : string;
        paid_by: string;
        paid_to: string;
        amount : number;
        created_at : ColumnType<Date, string | undefined, never>;
    }
}