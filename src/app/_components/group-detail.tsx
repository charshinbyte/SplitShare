"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "~/trpc/react";

type User = { id: string; name: string; email: string };

function GroupMembers({ groupId, users }: { groupId: string; users: User[] }) {
  const utils = api.useUtils();
  const [selectedUser, setSelectedUser] = useState("");

  const [members] = api.group.getMembers.useSuspenseQuery(groupId);
  const { data: settlements } = api.expenseShares.getSettlements.useQuery({
    groupId,
  });

  const nameFor = (userId: string) =>
    users.find((user) => user.id === userId)?.name ?? userId;

  function relationsFor(memberId: string) {
    if (!settlements) return [];
    return members
      .map((other) => other.user_id)
      .filter((otherId) => otherId !== memberId)
      .map((otherId) => {
        const owedToThem = settlements.transactions
          .filter((t) => t.from === otherId && t.to === memberId)
          .reduce((sum, t) => sum + t.amount, 0);
        const theyOwe = settlements.transactions
          .filter((t) => t.from === memberId && t.to === otherId)
          .reduce((sum, t) => sum + t.amount, 0);
        return { otherId, net: owedToThem - theyOwe };
      })
      .filter((relation) => Math.abs(relation.net) > 0.005);
  }

  const addMember = api.group.addUserToGroup.useMutation({
    onSuccess: async () => {
      setSelectedUser("");
      await utils.group.getMembers.invalidate(groupId);
    },
  });

  const removeMember = api.group.deleteUserFromGroup.useMutation({
    onSuccess: async () => {
      await utils.group.getMembers.invalidate(groupId);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    addMember.mutate({ group: groupId, user: selectedUser });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2 text-base text-white">
        {members.length === 0 && <li>No members yet.</li>}
        {members.map((member) => (
          <li key={member.user_id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {nameFor(member.user_id)}
              <button
                type="button"
                disabled={removeMember.isPending}
                onClick={() =>
                  removeMember.mutate({ group: groupId, user: member.user_id })
                }
                className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
              >
                Remove
              </button>
            </div>
            <ul className="ml-4 flex flex-col gap-0.5 text-sm">
              {relationsFor(member.user_id).map((relation) => (
                <li
                  key={relation.otherId}
                  className={relation.net > 0 ? "text-green-400" : "text-red-400"}
                >
                  {relation.net > 0
                    ? `${nameFor(relation.otherId)} owes you $${relation.net.toFixed(2)}`
                    : `you owe ${nameFor(relation.otherId)} $${Math.abs(relation.net).toFixed(2)}`}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {removeMember.error && (
        <p className="text-base text-white">{removeMember.error.message}</p>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <select
          value={selectedUser}
          onChange={(event) => setSelectedUser(event.target.value)}
          required
          className="rounded bg-white/10 px-2 py-1 text-white"
        >
          <option value="" disabled>
            Add member…
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button
          disabled={addMember.isPending}
          className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          {addMember.isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {addMember.error && <p className="text-base text-white">{addMember.error.message}</p>}
    </div>
  );
}

type ShareMode = "evenly" | "exact" | "percentage";

function ExpenseShares({
  expenseId,
  expenseAmount,
  memberUsers,
}: {
  expenseId: string;
  expenseAmount: number;
  memberUsers: User[];
}) {
  const utils = api.useUtils();
  const [isEditing, setIsEditing] = useState(false);
  const [mode, setMode] = useState<ShareMode>("exact");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const [shares] = api.expenseShares.getByGroup.useSuspenseQuery(expenseId);

  const setShare = api.expenseShares.setShare.useMutation({
    onSuccess: async () => {
      setIsEditing(false);
      await Promise.all([
        utils.expenseShares.getByGroup.invalidate(expenseId),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  function startEdit() {
    const nextSelected: Record<string, boolean> = {};
    const nextValues: Record<string, string> = {};
    for (const share of shares) {
      nextSelected[share.user_id] = true;
      nextValues[share.user_id] = String(share.amount_owed);
    }
    setSelected(nextSelected);
    setValues(nextValues);
    setMode("exact");
    setIsEditing(true);
  }

  function toggleSelected(userId: string) {
    setSelected((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  const participantIds = memberUsers
    .filter((user) => selected[user.id])
    .map((user) => user.id);

  const total = participantIds.reduce(
    (sum, id) => sum + (Number(values[id]) || 0),
    0,
  );
  const target = mode === "exact" ? expenseAmount : 100;
  const isValid =
    mode === "evenly"
      ? participantIds.length > 0
      : participantIds.length > 0 && Math.abs(total - target) < 0.005;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;

    if (mode === "evenly") {
      setShare.mutate({
        expenseId,
        mode: "evenly",
        shares: participantIds.map((userId) => ({ userId })),
      });
    } else {
      setShare.mutate({
        expenseId,
        mode,
        shares: participantIds.map((userId) => ({
          userId,
          split: Number(values[userId]),
        })),
      });
    }
  }

  if (!isEditing) {
    return (
      <div className="ml-4 flex flex-col gap-2">
        <ul className="flex flex-col gap-1 text-sm text-white/80">
          {shares.length === 0 && <li>No split set yet.</li>}
          {shares.map((share) => (
            <li key={share.user_id}>
              {memberUsers.find((user) => user.id === share.user_id)?.name ??
                share.user_id}{" "}
              owes ${share.amount_owed.toFixed(2)} (
              {((share.amount_owed / expenseAmount) * 100).toFixed(1)}%)
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={startEdit}
          className="w-fit rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
        >
          Edit split
        </button>
        {setShare.error && (
          <p className="text-sm text-white">{setShare.error.message}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="ml-4 flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-3 text-white/80">
        {(["evenly", "exact", "percentage"] as const).map((option) => (
          <label key={option} className="flex items-center gap-1">
            <input
              type="radio"
              name={`split-mode-${expenseId}`}
              checked={mode === option}
              onChange={() => setMode(option)}
            />
            {option === "evenly"
              ? "Evenly"
              : option === "exact"
                ? "Exact amounts"
                : "Percentages"}
          </label>
        ))}
      </div>

      <ul className="flex flex-col gap-1">
        {memberUsers.map((user) => (
          <li key={user.id} className="flex items-center gap-2 text-white">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!selected[user.id]}
                onChange={() => toggleSelected(user.id)}
              />
              {user.name}
            </label>
            {mode !== "evenly" && selected[user.id] && (
              <input
                value={values[user.id] ?? ""}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [user.id]: event.target.value,
                  }))
                }
                type="number"
                step="0.01"
                min="0"
                placeholder={mode === "exact" ? "Amount" : "Percent"}
                className="w-24 rounded bg-white/10 px-2 py-1 text-white"
              />
            )}
          </li>
        ))}
      </ul>

      {mode !== "evenly" && (
        <p className="text-white/70">
          Total: {total.toFixed(2)} / {target.toFixed(2)}
          {mode === "percentage" ? "%" : ""}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          disabled={!isValid || setShare.isPending}
          className="w-fit rounded bg-white/10 px-3 py-1 hover:bg-white/20 disabled:opacity-50"
        >
          {setShare.isPending ? "Saving…" : "Save split"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="w-fit rounded bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          Cancel
        </button>
      </div>

      {setShare.error && <p className="text-white">{setShare.error.message}</p>}
    </form>
  );
}

function GroupBalance({ groupId, users }: { groupId: string; users: User[] }) {
  const nameFor = (userId: string) =>
    users.find((user) => user.id === userId)?.name ?? userId;

  const { data, error, isPending } = api.expenseShares.getSettlements.useQuery({
    groupId,
  });

  if (isPending) {
    return <p className="text-base text-white">Loading…</p>;
  }
  if (error) {
    return <p className="text-base text-white">{error.message}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1 text-base text-white">
        {data.balances.length === 0 && <li>No members yet.</li>}
        {data.balances.map((balance) => (
          <li key={balance.userId}>
            {nameFor(balance.userId)}{" "}
            {balance.amount > 0.005 ? (
              <span className="text-green-400">
                is owed ${balance.amount.toFixed(2)}
              </span>
            ) : balance.amount < -0.005 ? (
              <span className="text-red-400">
                owes ${Math.abs(balance.amount).toFixed(2)}
              </span>
            ) : (
              <span className="text-white/70">is settled up</span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-white/70">
          Suggested payments to settle up
        </h4>
        <ul className="flex flex-col gap-1 text-base text-white">
          {data.transactions.length === 0 && <li>Everyone is settled up.</li>}
          {data.transactions.map((transaction, index) => (
            <li key={index}>
              {nameFor(transaction.from)} should pay {nameFor(transaction.to)}{" "}
              ${transaction.amount.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GroupSettlements({ groupId, users }: { groupId: string; users: User[] }) {
  const utils = api.useUtils();
  const [paidBy, setPaidBy] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [amount, setAmount] = useState("");

  const [members] = api.group.getMembers.useSuspenseQuery(groupId);
  const memberUsers = members.flatMap(
    (member) => users.find((user) => user.id === member.user_id) ?? [],
  );

  const [settlements] = api.settlement.getByGroup.useSuspenseQuery(groupId);

  const settleUp = api.settlement.settleUp.useMutation({
    onSuccess: async () => {
      setPaidBy("");
      setPaidTo("");
      setAmount("");
      await Promise.all([
        utils.settlement.getByGroup.invalidate(groupId),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  const deleteSettlement = api.settlement.deleteSettlement.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.settlement.getByGroup.invalidate(groupId),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paidBy || !paidTo) return;
    settleUp.mutate({
      group_id: groupId,
      paid_by: paidBy,
      paid_to: paidTo,
      amount: Number(amount),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-sm text-white/80">
        {settlements.length === 0 && <li>No payments recorded yet.</li>}
        {settlements.map((settlement) => (
          <li key={settlement.id} className="flex items-center gap-2">
            {users.find((user) => user.id === settlement.paid_by)?.name ??
              settlement.paid_by}{" "}
            paid{" "}
            {users.find((user) => user.id === settlement.paid_to)?.name ??
              settlement.paid_to}{" "}
            ${settlement.amount.toFixed(2)}
            <button
              type="button"
              disabled={deleteSettlement.isPending}
              onClick={() => deleteSettlement.mutate(settlement.id)}
              className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {deleteSettlement.error && (
        <p className="text-sm text-white">{deleteSettlement.error.message}</p>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <select
          value={paidBy}
          onChange={(event) => setPaidBy(event.target.value)}
          required
          className="rounded bg-white/10 px-2 py-1 text-white"
        >
          <option value="" disabled>
            Paid by…
          </option>
          {memberUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <span className="text-white/70">paid</span>
        <select
          value={paidTo}
          onChange={(event) => setPaidTo(event.target.value)}
          required
          className="rounded bg-white/10 px-2 py-1 text-white"
        >
          <option value="" disabled>
            Paid to…
          </option>
          {memberUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount"
          type="number"
          step="0.01"
          min="0"
          required
          className="w-24 rounded bg-white/10 px-2 py-1 text-white"
        />
        <button
          disabled={settleUp.isPending}
          className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          {settleUp.isPending ? "Recording…" : "Record payment"}
        </button>
      </form>

      {settleUp.error && (
        <p className="text-sm text-white">{settleUp.error.message}</p>
      )}
    </div>
  );
}

function GroupExpenses({ groupId, users }: { groupId: string; users: User[] }) {
  const utils = api.useUtils();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editPaidBy, setEditPaidBy] = useState("");

  const { data: editingShares } = api.expenseShares.getByGroup.useQuery(
    editingId ?? "",
    { enabled: !!editingId },
  );

  const [expenses] = api.expense.getByGroup.useSuspenseQuery(groupId);
  const [members] = api.group.getMembers.useSuspenseQuery(groupId);
  const memberUsers = members.flatMap(
    (member) => users.find((user) => user.id === member.user_id) ?? [],
  );

  const createExpense = api.expense.createExpense.useMutation({
    onSuccess: async () => {
      setDescription("");
      setAmount("");
      await Promise.all([
        utils.expense.getByGroup.invalidate(groupId),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  const updateExpense = api.expense.updateExpense.useMutation({
    onSuccess: async (_data, variables) => {
      setEditingId(null);
      await Promise.all([
        utils.expense.getByGroup.invalidate(groupId),
        utils.expenseShares.getByGroup.invalidate(variables.id),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  const deleteExpense = api.expense.deleteExpense.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.expense.getByGroup.invalidate(groupId),
        utils.expenseShares.getSettlements.invalidate(),
      ]);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paidBy) return;
    createExpense.mutate({
      group_id: groupId,
      paid_by: paidBy,
      desc: description,
      amount: Number(amount),
    });
  }

  function startEdit(expense: {
    id: string;
    description: string;
    amount: number;
    paid_by: string;
  }) {
    setEditingId(expense.id);
    setEditDescription(expense.description);
    setEditAmount(String(expense.amount));
    setEditOriginalAmount(String(expense.amount));
    setEditPaidBy(expense.paid_by);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !editPaidBy) return;
    updateExpense.mutate({
      id: editingId,
      desc: editDescription,
      amount: Number(editAmount),
      paid_by: editPaidBy,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-base text-white">
        {expenses.length === 0 && <li>No expenses yet.</li>}
        {expenses.map((expense) =>
          editingId === expense.id ? (
            <li key={expense.id}>
              <form
                onSubmit={submitEdit}
                className="flex items-center gap-2"
              >
                <input
                  value={editDescription}
                  onChange={(event) =>
                    setEditDescription(event.target.value)
                  }
                  placeholder="Description"
                  required
                  className="rounded bg-white/10 px-2 py-1 text-white"
                />
                <input
                  value={editAmount}
                  onChange={(event) => setEditAmount(event.target.value)}
                  placeholder="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="w-24 rounded bg-white/10 px-2 py-1 text-white"
                />
                <select
                  value={editPaidBy}
                  onChange={(event) => setEditPaidBy(event.target.value)}
                  required
                  className="rounded bg-white/10 px-2 py-1 text-white"
                >
                  <option value="" disabled>
                    Paid by…
                  </option>
                  {memberUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={updateExpense.isPending}
                  className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
                >
                  {updateExpense.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
                >
                  Cancel
                </button>
              </form>
              {(editingShares?.length ?? 0) > 0 &&
                editAmount !== editOriginalAmount && (
                  <p className="ml-2 text-sm text-yellow-400">
                    Changing the amount will clear the existing split for
                    this expense.
                  </p>
                )}
            </li>
          ) : (
            <li key={expense.id} className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                {expense.description} — ${expense.amount.toFixed(2)} — paid by{" "}
                {users.find((user) => user.id === expense.paid_by)?.name ??
                  expense.paid_by}
                <button
                  type="button"
                  onClick={() => startEdit(expense)}
                  className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deleteExpense.isPending}
                  onClick={() => deleteExpense.mutate(expense.id)}
                  className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
                >
                  Delete
                </button>
              </span>
              <ExpenseShares
                expenseId={expense.id}
                expenseAmount={expense.amount}
                memberUsers={memberUsers}
              />
            </li>
          ),
        )}
      </ul>

      {updateExpense.error && (
        <p className="text-base text-white">{updateExpense.error.message}</p>
      )}
      {deleteExpense.error && (
        <p className="text-base text-white">{deleteExpense.error.message}</p>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          required
          className="rounded bg-white/10 px-2 py-1 text-white"
        />
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount"
          type="number"
          step="0.01"
          min="0"
          required
          className="w-24 rounded bg-white/10 px-2 py-1 text-white"
        />
        <select
          value={paidBy}
          onChange={(event) => setPaidBy(event.target.value)}
          required
          className="rounded bg-white/10 px-2 py-1 text-white"
        >
          <option value="" disabled>
            Paid by…
          </option>
          {memberUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button
          disabled={createExpense.isPending}
          className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          {createExpense.isPending ? "Adding…" : "Add expense"}
        </button>
      </form>

      {createExpense.error && (
        <p className="text-base text-white">{createExpense.error.message}</p>
      )}
    </div>
  );
}

export function GroupDetail({ groupId }: { groupId: string }) {
  const router = useRouter();
  const utils = api.useUtils();

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  const [groups] = api.group.getAll.useSuspenseQuery();
  const [users] = api.user.getAll.useSuspenseQuery();

  const group = groups.find((group) => group.id === groupId);

  const updateGroup = api.group.updateByID.useMutation({
    onSuccess: async () => {
      setEditingName(false);
      await utils.group.getAll.invalidate();
    },
  });

  const deleteGroup = api.group.delete.useMutation({
    onSuccess: async () => {
      await utils.group.getAll.invalidate();
      router.push("/groups");
    },
  });

  function startEdit() {
    if (!group) return;
    setEditName(group.name);
    setEditingName(true);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateGroup.mutate({ id: groupId, name: editName });
  }

  if (!group) {
    return (
      <section className="flex flex-col gap-4 p-6 text-lg text-white">
        <p>Group not found.</p>
        <Link href="/" className="underline">
          Back to groups
        </Link>
      </section>
    );
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-6 p-6 text-lg text-white">
      <Link href="/" className="text-sm text-white/70 underline">
        ← Back to groups
      </Link>

      {editingName ? (
        <form onSubmit={submitEdit} className="flex items-center gap-3">
          <input
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            placeholder="Group name"
            required
            className="rounded bg-white/10 px-3 py-2 text-white"
          />
          <button
            disabled={updateGroup.isPending}
            className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
          >
            {updateGroup.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditingName(false)}
            className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{group.name}</h2>
          <button
            type="button"
            onClick={startEdit}
            className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={deleteGroup.isPending}
            onClick={() => deleteGroup.mutate(groupId)}
            className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
          >
            Delete
          </button>
        </div>
      )}
      <p className="text-sm text-white/70">
        Created by{" "}
        {users.find((user) => user.id === group.created_by)?.name ??
          group.created_by}
      </p>

      {updateGroup.error && <p>{updateGroup.error.message}</p>}
      {deleteGroup.error && <p>{deleteGroup.error.message}</p>}

      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">Members</h3>
        <GroupMembers groupId={groupId} users={users} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">Expenses</h3>
        <GroupExpenses groupId={groupId} users={users} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">Balance</h3>
        <GroupBalance groupId={groupId} users={users} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">Settle Up</h3>
        <GroupSettlements groupId={groupId} users={users} />
      </div>
    </section>
  );
}
