
import { Geist, Geist_Mono } from "next/font/google";
import { getDictionary } from "../../dictionaries";
import "../globals.css";
import { ThemeProvider } from "../../components/theme-provider";
import { Sidebar } from "../../components/Sidebar";
import { Footer } from "../../components/Footer";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

    return {
        metadataBase: new URL(baseUrl),
        title: {
            default: "Kitnets.com",
            template: `%s | Kitnets.com`,
        },
        description: dict.home.subtitle,
        openGraph: {
            type: 'website',
            locale: lang,
            url: `${baseUrl}/${lang}`,
            title: 'Kitnets.com',
            description: dict.home.subtitle,
            siteName: 'Kitnets.com',
        },
        robots: {
            index: true,
            follow: true,
        },
        alternates: {
            canonical: `${baseUrl}/${lang}`,
            languages: {
                'pt': `${baseUrl}/pt`,
                'en': `${baseUrl}/en`,
                'es': `${baseUrl}/es`,
            },
        },
    };
}

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
        <ClerkProvider>
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
        </ClerkProvider>
    );
}
