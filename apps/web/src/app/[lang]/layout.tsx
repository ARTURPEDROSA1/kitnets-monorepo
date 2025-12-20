import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { ThemeProvider } from "../../components/theme-provider";
import { Sidebar } from "../../components/Sidebar";
import { Footer } from "../../components/Footer";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Kitnets.com",
    description: "Encontre sua kitnet ideal.",
};

export async function generateStaticParams() {
    return [{ lang: "en" }, { lang: "pt" }, { lang: "es" }];
}

export default async function RootLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    return (
        <html lang={lang} suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-black text-black dark:text-white`}
            >
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <Sidebar lang={lang} />
                    <div className="sm:ml-64 flex min-h-screen flex-col pt-16 sm:pt-0">
                        <div className="flex-1 p-4">
                            {children}
                        </div>
                        <Footer lang={lang} />
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
