import { Link } from "@/i18n/routing";

export default function Home() {
  return (
    <div className="flex flex-col justify-center items-center gap-8">
      <h1 className="text-8xl font-bold">NoeTree</h1>
      <p>
        Bienvenue sur NoeTree, le site est en construction, merci de votre
        compréhension.
      </p>
      <Link href="/dashboard">Dashboard</Link>
    </div>
  );
}
