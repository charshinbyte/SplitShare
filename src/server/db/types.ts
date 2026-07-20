export interface Database {
    users: {
        id : string;
        name : string;
        email : string;
    };

    expenses: {
        id : string;
        description : string;
        amount : number;
        paid_by : string;
    };

    expense_shares: {
        expense_id : string;
        user_id: string;
        amount_owed: number;
    };
}