import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { ThemeProvider } from "next-themes";
import Header from "@/components/Header";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NoeTree",
  description: "NoeTree app",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <html lang="en" suppressHydrationWarning>
          <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden selection:bg-primary selection:text-white`}
          >
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <Header />
              <main className="h-full overflow-y-auto">{children}</main>
            </ThemeProvider>
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
