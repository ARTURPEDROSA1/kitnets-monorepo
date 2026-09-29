import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/dashboard/', '/api/', '/onboarding/',
                // FipeZAP city pages: only the canonical URL, never the reader-state variants (src/lib/crawler-guard.ts)
                '/*indices/fipezap/cidades*?',
            ],
        },
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
