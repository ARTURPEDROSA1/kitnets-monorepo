import { notFound } from 'next/navigation';
import { getArticleBySlug } from '@/services/cms';
import { MDXRenderer } from '@/components/cms/MDXRenderer';
import { MDXRemote as MDXRemoteRSC } from 'next-mdx-remote/rsc';
import { COMPONENTS } from '@/components/cms/MDXComponents';
import { Metadata } from 'next';

type Props = {
    params: Promise<{ lang: string; category: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang, category, slug } = await params;
    const article = await getArticleBySlug(lang, category, slug);

    if (!article) return {};

    const { seo_title, seo_description, og_image_url } = article.translation.metadata;

    return {
        title: seo_title || article.translation.title,
        description: seo_description || article.translation.excerpt,
        openGraph: {
            images: og_image_url ? [og_image_url] : [],
        },
    };
}

export default async function ArticlePage({ params }: Props) {
    const { lang, category, slug } = await params;
    const article = await getArticleBySlug(lang, category, slug);

    if (!article) {
        notFound();
    }

    return (
        <article className="container mx-auto px-4 py-8 max-w-4xl">
            <header className="mb-8">
                <h1 className="text-4xl font-bold mb-4">{article.translation.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {article.author ? (
                        <div className="flex items-center gap-2">
                            {article.author.avatar_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={article.author.avatar_url} alt={article.author.name} className="w-8 h-8 rounded-full" />
                            )}
                            <span>{article.author.name}</span>
                        </div>
                    ) : null}
                    <span>•</span>
                    <time dateTime={article.published_at || ''}>
                        {new Date(article.published_at || '').toLocaleDateString(lang, { dateStyle: 'long' })}
                    </time>
                    {article.translation.reading_time_minutes && (
                        <><span>•</span><span>{article.translation.reading_time_minutes} min read</span></>
                    )}
                </div>
            </header>

            <div className="prose dark:prose-invert max-w-none">
                {article.translation.content_compiled ? (
                    <MDXRenderer compiledSource={article.translation.content_compiled} />
                ) : (
                    <MDXRemoteRSC source={article.translation.content_mdx} components={COMPONENTS} />
                )}
            </div>

            {article.tags && article.tags.length > 0 && (
                <div className="mt-12 flex gap-2 flex-wrap">
                    {article.tags.map(tag => (
                        <span key={tag.slug} className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm">
                            #{tag.name}
                        </span>
                    ))}
                </div>
            )}
        </article>
    );
}
