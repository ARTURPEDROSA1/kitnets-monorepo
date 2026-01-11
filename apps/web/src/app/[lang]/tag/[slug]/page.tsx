import { getArticlesByTag } from '@/services/cms';
import Link from 'next/link';
import { Metadata } from 'next';

type Props = {
    params: Promise<{ lang: string; slug: string }>;
    searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    return {
        title: `Tag: ${slug} - Kitnets`,
    }
}

export default async function TagPage({ params, searchParams }: Props) {
    const { lang, slug } = await params;
    const { page } = await searchParams;
    const pageNum = page ? parseInt(page) : 1;
    const pageSize = 12;

    const { data: articles, count } = await getArticlesByTag(lang, slug, pageNum, pageSize);
    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8 capitalize">Tag: {slug}</h1>

            {articles.length === 0 ? (
                <p className="text-muted-foreground">No articles found for this tag.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((article: any) => (
                        <article key={article.id} className="border rounded-lg overflow-hidden flex flex-col hover:shadow-lg transition bg-card text-card-foreground">
                            <div className="p-6 flex-1 flex flex-col">
                                <Link href={`/${lang}/conteudos/${article.category.slug}/${article.translation.slug}`} className="hover:text-primary transition-colors">
                                    <h2 className="text-xl font-bold mb-2">{article.translation.title}</h2>
                                </Link>
                                <p className="text-muted-foreground mb-4 line-clamp-3 text-sm">{article.translation.excerpt}</p>
                                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{new Date(article.published_at).toLocaleDateString(lang)}</span>
                                    <span>{article.translation.reading_time_minutes} min read</span>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
