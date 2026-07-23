"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export function Users() {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [lookupId, setLookupId] = useState("");

  const [users] = api.user.getAll.useSuspenseQuery();

  const lookupUser = api.user.userByID.useQuery(lookupId, {
    enabled: false,
  });

  const createUser = api.user.create.useMutation({
    onSuccess: async () => {
      setName("");
      setEmail("");
      await utils.user.getAll.invalidate();
    },
  });

  const updateUser = api.user.updateByID.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await utils.user.getAll.invalidate();
    },
  });

  const deleteUser = api.user.deleteByID.useMutation({
    onSuccess: async () => {
      await utils.user.getAll.invalidate();
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createUser.mutate({ name, email });
  }

  function startEdit(user: { id: string; name: string; email: string }) {
    setEditingId(user.id);
    setEditName(user.name);
    setEditEmail(user.email);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    updateUser.mutate({ id: editingId, name: editName, email: editEmail });
  }

  function submitLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupId) return;
    void lookupUser.refetch();
  }

  return (
    <section className="flex flex-col gap-6 p-6 text-lg text-white">
      <h2 className="text-2xl font-semibold">Users</h2>

      <form onSubmit={submit} className="flex items-center gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          required
          className="rounded bg-white/10 px-3 py-2 text-white"
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
          className="rounded bg-white/10 px-3 py-2 text-white"
        />
        <button
          disabled={createUser.isPending}
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
        >
          {createUser.isPending ? "Creating…" : "Create user"}
        </button>
      </form>

      {createUser.error && <p>{createUser.error.message}</p>}

      <ul className="flex flex-col gap-3">
        {users.map((user) =>
          editingId === user.id ? (
            <li key={user.id}>
              <form onSubmit={submitEdit} className="flex items-center gap-3">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="Name"
                  required
                  className="rounded bg-white/10 px-3 py-2 text-white"
                />
                <input
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  required
                  className="rounded bg-white/10 px-3 py-2 text-white"
                />
                <button
                  disabled={updateUser.isPending}
                  className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
                >
                  {updateUser.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
                >
                  Cancel
                </button>
              </form>
            </li>
          ) : (
            <li key={user.id} className="flex items-center gap-3">
              <span>
                {user.name} — {user.email} — {user.id}
              </span>
              <button
                type="button"
                onClick={() => startEdit(user)}
                className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={deleteUser.isPending}
                onClick={() => deleteUser.mutate(user.id)}
                className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
              >
                Delete
              </button>
            </li>
          ),
        )}
      </ul>

      {updateUser.error && <p>{updateUser.error.message}</p>}
      {deleteUser.error && <p>{deleteUser.error.message}</p>}

      <h3 className="text-xl font-semibold">Find user by ID</h3>
      <form onSubmit={submitLookup} className="flex items-center gap-3">
        <input
          value={lookupId}
          onChange={(event) => setLookupId(event.target.value)}
          placeholder="User ID"
          required
          className="rounded bg-white/10 px-3 py-2 text-white"
        />
        <button
          disabled={lookupUser.isFetching}
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
        >
          {lookupUser.isFetching ? "Searching…" : "Find"}
        </button>
      </form>

      {lookupUser.error && <p>{lookupUser.error.message}</p>}
      {lookupUser.isFetched && !lookupUser.error && (
        <p>
          {lookupUser.data
            ? `${lookupUser.data.name} — ${lookupUser.data.email}`
            : "No user found with that ID."}
        </p>
      )}
    </section>
  );
}
