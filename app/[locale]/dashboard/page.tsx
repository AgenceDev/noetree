import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function Dashboard() {
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col justify-center items-center gap-8 p-6">
      <h1 className="text-8xl font-bold">{t("title")}</h1>
      <Link href="/dashboard/notes">{t("notesLink")}</Link>
    </div>
  );
}
