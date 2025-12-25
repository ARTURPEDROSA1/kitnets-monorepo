import { MetadataRoute } from 'next';
import { getAllIndexes } from '@/lib/indexes';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
const languages = ['pt', 'en', 'es'];

// List of static routes
const staticRoutes = [
    '',
    'alugar',
    'anunciar',
    'aviso-legal',
    'calculadora-amortizacao-financiamento-imobiliario',
    'calculadora-reajuste-aluguel',
    'calculadoras/renda-aluguel',
    'comprar',
    'disclosure',
    'forgot-password',
    'lancamentos',
    'links-uteis',
    'login',
    'login/construtora',
    'login/corretor',
    'login/imobiliaria',
    'login/proprietario',
    'perguntas-frequentes',
    'politica-de-cookies',
    'politica-de-privacidade',
    'signup',
    'signup/construtora',
    'signup/corretor',
    'signup/imobiliaria',
    'signup/proprietario',
    'termos-de-uso',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const sitemapEntry: MetadataRoute.Sitemap = [];

    // 1. Static Routes
    staticRoutes.forEach((route) => {
        languages.forEach((lang) => {
            sitemapEntry.push({
                url: `${baseUrl}/${lang}${route ? `/${route}` : ''}`,
                lastModified: new Date(),
                changeFrequency: route === '' ? 'daily' : 'weekly',
                priority: route === '' ? 1 : 0.8,
            });
        });
    });

    // 2. Dynamic Routes: Economic Indexes
    try {
        const indexes = await getAllIndexes();
        indexes.forEach((idx) => {
            languages.forEach((lang) => {
                sitemapEntry.push({
                    url: `${baseUrl}/${lang}/indices/${idx.code.toLowerCase()}`,
                    lastModified: new Date(),
                    changeFrequency: 'monthly',
                    priority: 0.9,
                });
            });
        });
    } catch (error) {
        console.error("Failed to fetch indexes for sitemap", error);
    }

    return sitemapEntry;
}
