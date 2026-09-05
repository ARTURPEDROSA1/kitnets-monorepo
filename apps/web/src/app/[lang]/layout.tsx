
import type { Viewport } from "next";
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
    display: 'swap',
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    display: 'swap',
});

export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#000000' },
    ],
    width: 'device-width',
    initialScale: 1,
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://kitnets.com');

    return {
        metadataBase: new URL(baseUrl),
        title: {
            default: "Kitnets.com",
            template: `%s | Kitnets.com`,
        },
        description: dict.home.subtitle,
        icons: {
            icon: '/favicon.ico',
            shortcut: '/favicon.ico',
            apple: '/apple-icon.png',
        },
        applicationName: 'Kitnets.com',
        authors: [{ name: "Kitnets.com Team", url: baseUrl }],
        generator: 'Next.js',
        keywords: [
            "kitnets", "aluguel", "moradia", "imóveis", "calculadoras", "financiamento",
            "investimento", "IPCA", "IGPM", "INPC", "real estate", "rent", "Brazil",
            "multa aluguel", "rescisão contrato", "aluguel atrasado", "rental fine", "lease termination",
            "calculadora aluguel", "índices econômicos", "mercado imobiliário"
        ],
        referrer: 'origin-when-cross-origin',
        creator: "Kitnets.com",
        publisher: "Kitnets.com",
        category: "Real Estate",
        classification: "Real Estate Portal",
        formatDetection: {
            email: false,
            address: false,
            telephone: false,
        },
        // alternates: removed to allow pages to define their own specific canonicals
        // or we could implement a default based on headers, but static metadata is safer at page level
        openGraph: {
            type: 'website',
            locale: lang,
            // url: inherited from metadataBase + path if not specified, which is better than hardcoding root
            title: 'Kitnets.com',
            description: dict.home.subtitle,
            siteName: 'Kitnets.com',
            images: [
                {
                    url: `${baseUrl}/icon.png`,
                    width: 512,
                    height: 512,
                    alt: 'Kitnets.com Logo',
                },
            ],
        },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                'max-video-preview': -1,
                'max-image-preview': 'large',
                'max-snippet': -1,
            },
        },
        twitter: {
            card: 'summary',
            title: 'Kitnets.com',
            description: dict.home.subtitle,
            images: [`${baseUrl}/icon.png`],
        },
        appleWebApp: {
            capable: true,
            title: 'Kitnets',
            statusBarStyle: 'default',
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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const dict = getDictionary(lang);

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "name": "Kitnets.com",
                "url": baseUrl,
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": `${baseUrl}/search?q={search_term_string}`,
                    "query-input": "required name=search_term_string"
                }
            },
            {
                "@type": "Organization",
                "name": "Kitnets.com",
                "url": baseUrl,
                "logo": `${baseUrl}/icon.png`
            }
        ]
    };
    return (
        <ClerkProvider>
            <html lang={lang} suppressHydrationWarning>
                <head>
                    <link rel="dns-prefetch" href="https://kqhfzcxqmjkqekozhlng.supabase.co" />
                    <link rel="preconnect" href="https://kqhfzcxqmjkqekozhlng.supabase.co" crossOrigin="anonymous" />
                    <link rel="preconnect" href="https://clerk.kitnets.com" crossOrigin="anonymous" />
                </head>
                <body
                    className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-black text-black dark:text-white`}
                >
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                    >
                        <Sidebar lang={lang} dict={{
                            menu: dict.menu,
                            rentLateFineCalculatorPage: dict.rentLateFineCalculatorPage ? { menuTitle: dict.rentLateFineCalculatorPage.menuTitle } : undefined,
                            rentFineCalculatorPage: dict.rentFineCalculatorPage ? { menuTitle: dict.rentFineCalculatorPage.menuTitle } : undefined,
                            proRataRentCalculatorPage: (dict.proRataRentCalculatorPage as Record<string, unknown>)?.menuTitle ? { menuTitle: (dict.proRataRentCalculatorPage as Record<string, unknown>).menuTitle as string } : undefined,
                        }} />
                        <div className="sm:ml-64 flex min-h-screen flex-col pt-16 sm:pt-0">
                            <div className="flex-1 p-4">
                                {children}
                            </div>
                            <Footer lang={lang} dict={{ footer: dict.footer }} />
                        </div>
                    </ThemeProvider>
                    <script
                        type="application/ld+json"
                        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                    />
                </body>
            </html>
        </ClerkProvider>
    );
}
