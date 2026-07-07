import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import Header from "@/components/Header";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderProvider } from "@/providers/HeaderProvider";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <html lang={locale} suppressHydrationWarning>
          <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-primary selection:text-white`}
          >
            <NextIntlClientProvider messages={messages}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <HeaderProvider>
                  <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset className="flex flex-col h-screen overflow-hidden bg-background">
                      <Header />
                      <main className="flex-1 overflow-y-auto">{children}</main>
                    </SidebarInset>
                  </SidebarProvider>
                </HeaderProvider>
              </ThemeProvider>
            </NextIntlClientProvider>
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
