"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "~/trpc/react";

export function Groups() {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [createdBy, setCreatedBy] = useState("");

  const [groups] = api.group.getAll.useSuspenseQuery();
  const [users] = api.user.getAll.useSuspenseQuery();

  const createGroup = api.group.create.useMutation({
    onSuccess: async () => {
      setName("");
      await utils.group.getAll.invalidate();
    },
  });

  const deleteGroup = api.group.delete.useMutation({
    onSuccess: async () => {
      await utils.group.getAll.invalidate();
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createdBy) return;
    createGroup.mutate({ name, createdBy });
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-6 p-6 text-lg text-white">
      <h2 className="text-2xl font-semibold">Groups</h2>

      <form onSubmit={submit} className="flex items-center gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Group name"
          required
          className="rounded bg-white/10 px-3 py-2 text-white"
        />
        <select
          value={createdBy}
          onChange={(event) => setCreatedBy(event.target.value)}
          required
          className="rounded bg-white/10 px-3 py-2 text-white"
        >
          <option value="" disabled>
            Created by…
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button
          disabled={createGroup.isPending}
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
        >
          {createGroup.isPending ? "Creating…" : "Create group"}
        </button>
      </form>

      {createGroup.error && <p>{createGroup.error.message}</p>}
      {deleteGroup.error && <p>{deleteGroup.error.message}</p>}

      <ul className="flex flex-col gap-3">
        {groups.length === 0 && <li>No groups yet.</li>}
        {groups.map((group) => (
          <li
            key={group.id}
            className="flex items-center gap-3 rounded bg-white/5 px-4 py-3"
          >
            <Link href={`/groups/${group.id}`} className="flex-1 hover:underline">
              {group.name} — created by{" "}
              {users.find((user) => user.id === group.created_by)?.name ??
                group.created_by}
            </Link>
            <button
              type="button"
              disabled={deleteGroup.isPending}
              onClick={() => deleteGroup.mutate(group.id)}
              className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
