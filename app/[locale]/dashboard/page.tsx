import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="flex flex-col justify-center items-center gap-8 p-6">
      <h1 className="text-8xl font-bold">Dashboard</h1>
      <Link href="/dashboard/notes">Notes</Link>
    </div>
  );
}
