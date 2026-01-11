import { getArticlesByAuthor, getAuthorBySlug } from '@/services/cms';
import Link from 'next/link';
import { getDictionary } from '@/dictionaries';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { Youtube } from 'lucide-react';

type Props = {
    params: Promise<{ lang: string; slug: string }>;
    searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const author = await getAuthorBySlug(slug);

    if (!author) return {};

    return {
        title: `${author.name} - Kitnets`,
        description: author.bio || `Articles by ${author.name}`,
    }
}

export default async function AuthorPage({ params, searchParams }: Props) {
    const { lang, slug } = await params;
    const { page } = await searchParams;
    const pageNum = page ? parseInt(page) : 1;
    const pageSize = 12;
    const dict = getDictionary(lang);

    const author = await getAuthorBySlug(slug);

    if (!author) {
        notFound();
    }

    const { data: articles, count } = await getArticlesByAuthor(lang, slug, pageNum, pageSize);

    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-12 flex flex-col items-center text-center">
                {author.avatar_url && (
                    <div className="relative w-32 h-32 mb-4 rounded-full overflow-hidden border-4 border-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={author.avatar_url}
                            alt={author.name}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
                <h1 className="text-3xl font-bold mb-2">{author.name}</h1>
                {author.bio && (
                    <p className="text-muted-foreground max-w-2xl">{author.bio}</p>
                )}

                {author.social_links && (
                    <div className="flex items-center gap-4 mt-6">
                        {author.social_links.youtube && (
                            <a
                                href={author.social_links.youtube}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-[#FF0000] transition-all duration-300"
                                title="YouTube"
                            >
                                <Youtube size={24} />
                            </a>
                        )}
                        {author.social_links.website && (
                            <a
                                href={author.social_links.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-full bg-muted/50 hover:bg-muted transition-all duration-300 flex items-center justify-center w-10 h-10"
                                title="Website"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={
                                        ['kitnets.com', 'www.kitnets.com', 'localhost'].includes(new URL(author.social_links.website).hostname)
                                            ? '/icon.png'
                                            : `https://www.google.com/s2/favicons?domain=${new URL(author.social_links.website).hostname}&sz=64`
                                    }
                                    alt="Website"
                                    className="w-5 h-5 rounded-sm"
                                />
                            </a>
                        )}
                    </div>
                )}
            </div>

            <h2 className="text-2xl font-bold mb-6">{dict.author?.articlesBy ? `${dict.author.articlesBy} ${author.name}` : `Articles by ${author.name}`}</h2>

            {articles.length === 0 ? (
                <p className="text-muted-foreground">No articles found for this author.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((article: any) => (
                        <article key={article.id} className="border rounded-lg overflow-hidden flex flex-col hover:shadow-lg transition bg-card text-card-foreground">
                            {article.translation.metadata?.og_image_url && (
                                <div className="h-48 relative overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={article.translation.metadata.og_image_url}
                                        alt={article.translation.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            )}
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

            {totalPages > 1 && (
                <div className="mt-12 flex justify-center gap-2">
                    {pageNum > 1 && (
                        <Link href={`?page=${pageNum - 1}`} className="px-4 py-2 border rounded hover:bg-accent">Previous</Link>
                    )}
                    <span className="px-4 py-2">Page {pageNum} of {totalPages}</span>
                    {pageNum < totalPages && (
                        <Link href={`?page=${pageNum + 1}`} className="px-4 py-2 border rounded hover:bg-accent">Next</Link>
                    )}
                </div>
            )}
        </div>
    );
}
