import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("Landing");

  return (
    <div className="flex flex-col justify-center items-center gap-8">
      <h1 className="text-8xl font-bold">NoeTree</h1>
      <p>{t("welcome")}</p>
      <Link href="/dashboard">{t("dashboardLink")}</Link>
    </div>
  );
}
