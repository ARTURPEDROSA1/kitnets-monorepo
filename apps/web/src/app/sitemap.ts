import { MetadataRoute } from 'next';
import { getAllIndexes } from '@/lib/indexes';
import { getAllArticles } from '@/services/cms';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
const languages = ['pt', 'en', 'es'];

// List of static routes
const staticRoutes = [
    '',
    'alugar',
    'anunciar',
    'aviso-legal',
    'calculadora-amortizacao-financiamento-imobiliario',
    'calculadora-juros-compostos',
    'calculadora-reajuste-aluguel',
    'calculadoras',
    'calculadoras/aluguel-proporcional',
    'calculadoras/conversor-juros-mensal-anual',
    'calculadoras/renda-aluguel',
    'comprar',
    'disclosure',
    'forgot-password',
    'indices/panorama',
    'lancamentos',
    'links-uteis',
    'lista-vip',
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
    'calculadora-independencia-financeira',
    'new-listing',
    'waitlist',
    'calculadoras/multa-atraso-aluguel',
    'calculadoras/multa-rescisao-contrato-aluguel',
    'conteudos',
    'conteudos/impostos-e-legislacao',
    'conteudos/salario-e-renda',
    'autor/artur-pedrosa',
    'calculadoras/aluguel-na-holding',
    'calculadoras/aluguel-na-pf',
    'calculadoras/imposto-aluguel-pessoa-fisica',
    'calculadoras/imposto-minimo-altas-rendas',
    'calculadoras/imposto-minimo-pf',
    'calculadoras/irpf-2026',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const sitemapEntry: MetadataRoute.Sitemap = [];

    // 1. Static Routes
    staticRoutes.forEach((route) => {
        const languagesAlternates: Record<string, string> = {};
        languages.forEach(l => {
            languagesAlternates[l] = `${baseUrl}/${l}${route ? `/${route}` : ''}`;
        });

        languages.forEach((lang) => {
            sitemapEntry.push({
                url: `${baseUrl}/${lang}${route ? `/${route}` : ''}`,
                lastModified: new Date(),
                changeFrequency: route === '' ? 'daily' : 'weekly',
                priority: route === '' ? 1 : 0.8,
                alternates: {
                    languages: languagesAlternates
                }
            });
        });
    });

    // 2. Dynamic Routes: Economic Indexes
    try {
        const indexes = await getAllIndexes();
        indexes.forEach((idx) => {
            const languagesAlternates: Record<string, string> = {};
            languages.forEach(l => {
                languagesAlternates[l] = `${baseUrl}/${l}/indices/${idx.code.toLowerCase()}`;
            });

            languages.forEach((lang) => {
                sitemapEntry.push({
                    url: `${baseUrl}/${lang}/indices/${idx.code.toLowerCase()}`,
                    lastModified: new Date(),
                    changeFrequency: 'monthly',
                    priority: 0.9,
                    alternates: {
                        languages: languagesAlternates
                    }
                });
            });
        });
    } catch (error) {
        console.error("Failed to fetch indexes for sitemap", error);
    }

    // 3. Dynamic Routes: Articles
    try {
        const articles = await getAllArticles();

        // Group articles by "key" (category/slug) to build alternates
        // Since getAllArticles returns one entry per lang/slug combo, we need to regroup content that represents the same article.
        // Assuming slugs are same across langs? Or we need logic.
        // Currently, getArticleBySlug queries by translation.slug.
        // If translation slugs are unique per language, we might not easily know which ES article matches which PT article unless they share a common ID or English slug.
        // The getAllArticles returns { lang, categorySlug, slug, updatedAt }.
        // If we simply list all of them with self-referencing alternates for now (or no alternates if we can't match them), it's better than nothing.
        // IMPROVEMENT: Ideally, we should group by article_id to provide correct hreflang alternates.

        // For now, let's treat them individually to ensure they are indexed.
        articles.forEach((article) => {
            sitemapEntry.push({
                url: `${baseUrl}/${article.lang}/conteudos/${article.categorySlug}/${article.slug}`,
                lastModified: new Date(article.updatedAt),
                changeFrequency: 'weekly',
                priority: 0.7,
            });
        });

    } catch (error) {
        console.error("Failed to fetch articles for sitemap", error);
    }

    return sitemapEntry;
}
