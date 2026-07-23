import { Users } from "~/app/_components/users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <Users />
    </main>
  );
}
