import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
const languages = ['pt', 'en', 'es'];

// List of static routes
const routes = [
    '',
    'alugar',
    'anunciar',
    'aviso-legal',
    'calculadora-amortizacao-financiamento-imobiliario',
    'calculadora-reajuste-aluguel',
    'calculadoras',
    'comprar',
    'disclosure',
    'indices',
    'lancamentos',
    'links-uteis',
    'login',
    'perguntas-frequentes',
    'politica-de-cookies',
    'politica-de-privacidade',
    'signup',
    'termos-de-uso',
];

export default function sitemap(): MetadataRoute.Sitemap {
    const sitemapEntry: MetadataRoute.Sitemap = [];

    routes.forEach((route) => {
        languages.forEach((lang) => {
            sitemapEntry.push({
                url: `${baseUrl}/${lang}${route ? `/${route}` : ''}`,
                lastModified: new Date(),
                changeFrequency: route === '' ? 'daily' : 'weekly',
                priority: route === '' ? 1 : 0.8,
            });
        });
    });

    return sitemapEntry;
}
