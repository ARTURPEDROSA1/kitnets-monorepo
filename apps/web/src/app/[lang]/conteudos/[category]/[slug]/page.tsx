import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getArticleBySlug } from '@/services/cms';
import { MDXRemote as MDXRemoteRSC } from 'next-mdx-remote/rsc';
import { COMPONENTS } from '@/components/cms/MDXComponents';
import { Metadata } from 'next';
import remarkGfm from 'remark-gfm';


type Props = {
    params: Promise<{ lang: string; category: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang, category, slug } = await params;
    const article = await getArticleBySlug(lang, category, slug);

    if (!article) return {};

    const { seo_title, seo_description, og_image_url } = article.translation.metadata;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const canonicalUrl = `${baseUrl}/${lang}/conteudos/${category}/${slug}`;

    return {
        title: seo_title || article.translation.title,
        description: seo_description || article.translation.excerpt,
        openGraph: {
            images: og_image_url ? [og_image_url] : [],
            type: 'article',
            publishedTime: article.published_at || undefined,
            modifiedTime: article.updated_at || undefined,
            authors: article.author ? [article.author.name] : undefined,
            section: article.category?.name,
            tags: article.tags?.map(t => t.name),
        },
        alternates: {
            canonical: canonicalUrl,
        },
    };
}

export default async function ArticlePage({ params }: Props) {
    const { lang, category, slug } = await params;
    const article = await getArticleBySlug(lang, category, slug);

    if (!article) {
        notFound();
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://kitnets.com';
    const cleanImage = article.translation.metadata?.og_image_url?.startsWith('http')
        ? article.translation.metadata.og_image_url
        : `${baseUrl}${article.translation.metadata.og_image_url}`;

    // JSON-LD for Search Engines
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": article.translation.metadata.seo_title || article.translation.title,
        "image": cleanImage ? [cleanImage] : [],
        "datePublished": article.published_at,
        "dateModified": article.updated_at,
        "author": [{
            "@type": "Person",
            "name": article.author?.name || "Kitnets.com",
            "url": article.author ? `${baseUrl}/${lang}/conteudos/autor/${article.author.slug}` : baseUrl
        }],
        "publisher": {
            "@type": "Organization",
            "name": "Kitnets.com",
            "logo": {
                "@type": "ImageObject",
                "url": `${baseUrl}/icon.png`
            }
        },
        "description": article.translation.metadata.seo_description || article.translation.excerpt
    };

    const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": `${baseUrl}/${lang}`
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": article.category?.name || category,
                "item": `${baseUrl}/${lang}/conteudos/${category}`
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": article.translation.title,
                "item": `${baseUrl}/${lang}/conteudos/${category}/${slug}`
            }
        ]
    };

    return (
        <article className="container mx-auto px-4 py-8 max-w-4xl">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
            />

            <header className="mb-8">
                {/* Check if local or remote image for next/image optimization */}
                {article.translation.metadata?.og_image_url && (
                    <div className="relative w-full h-64 md:h-96 mb-8 rounded-xl overflow-hidden shadow-sm">
                        <Image
                            src={article.translation.metadata.og_image_url}
                            alt={article.translation.title}
                            fill
                            className="object-cover"
                            priority
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
                        />
                    </div>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                    <Link href={`/${lang}/conteudos/${category}`} className="text-sm font-medium text-primary hover:underline uppercase tracking-wider">
                        {article.category?.name || category.replace(/-/g, ' ')}
                    </Link>
                </div>
                <h1 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight leading-tight text-foreground">{article.translation.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground border-b pb-8">
                    {article.author?.avatar_url && (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden border">
                            <Image
                                src={article.author.avatar_url}
                                alt={article.author.name}
                                fill
                                className="object-cover"
                            />
                        </div>
                    )}
                    <div>
                        <p className="font-medium text-foreground">
                            {article.author?.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                            <time dateTime={article.published_at || ''}>
                                {new Date(article.published_at || '').toLocaleDateString(lang, { dateStyle: 'long' })}
                            </time>
                            {article.translation.reading_time_minutes && (
                                <><span>•</span><span>{article.translation.reading_time_minutes} min read</span></>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <div className="prose dark:prose-invert max-w-none prose-lg prose-headings:font-bold prose-h2:text-3xl prose-h3:text-2xl prose-a:text-primary prose-img:rounded-xl">
                <MDXRemoteRSC
                    source={(article.translation.content_mdx || '').replace(/([^|])(\r\n|\n|\r)\|/g, '$1\n\n|')}
                    components={COMPONENTS}
                    options={{
                        mdxOptions: {
                            remarkPlugins: [remarkGfm]
                        }
                    }}
                />
            </div>

            {article.author && (
                <div className="mt-16 pt-8 border-t flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-muted/20 p-8 rounded-2xl">
                    {article.author.avatar_url && (
                        <Link href={`/${lang}/conteudos/autor/${article.author.slug}`} className="flex-shrink-0 relative w-24 h-24 rounded-full overflow-hidden border-4 border-background shadow-md">
                            <Image
                                src={article.author.avatar_url}
                                alt={article.author.name}
                                fill
                                className="object-cover"
                            />
                        </Link>
                    )}
                    <div className="text-center sm:text-left">
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            {lang === 'pt' ? 'Escrito por' : lang === 'es' ? 'Escrito por' : 'Written by'}
                        </p>
                        <Link href={`/${lang}/conteudos/autor/${article.author.slug}`} className="text-xl font-bold text-foreground hover:text-primary transition-colors">
                            {article.author.name}
                        </Link>

                        {article.author.slug === 'artur-pedrosa' ? (
                            <p className="text-muted-foreground mt-2 mb-4 leading-relaxed">Fundador da Kitnets.com | Especialista em mercado imobiliário e finanças pessoais</p>
                        ) : (
                            article.author.bio && (
                                <p className="text-muted-foreground mt-2 mb-4 leading-relaxed">{article.author.bio}</p>
                            )
                        )}

                        <Link href={`/${lang}/conteudos/autor/${article.author.slug}`} className="text-primary font-medium hover:underline text-sm inline-flex items-center gap-1">
                            {lang === 'pt' ? 'Ver perfil completo' : lang === 'es' ? 'Ver perfil completo' : 'View full profile'}
                            <span>→</span>
                        </Link>
                    </div>
                </div>
            )}

            {article.tags && article.tags.length > 0 && (
                <div className="mt-8 flex gap-2 flex-wrap">
                    {article.tags.map(tag => (
                        <span key={tag.slug} className="px-4 py-1.5 bg-secondary/50 text-secondary-foreground rounded-full text-sm font-medium hover:bg-secondary transition-colors cursor-default">
                            #{tag.name}
                        </span>
                    ))}
                </div>
            )}
        </article>
    );
}
