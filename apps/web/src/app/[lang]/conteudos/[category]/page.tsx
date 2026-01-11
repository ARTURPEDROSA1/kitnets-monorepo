import { getArticlesByCategory } from '@/services/cms';
import Link from 'next/link';
import { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';

type Props = {
    params: Promise<{ lang: string; category: string }>;
    searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang, category } = await params;
    return {
        title: `Articles in ${category} - Kitnets`, // TODO: Fetch category details for proper name
    }
}

export default async function CategoryPage({ params, searchParams }: Props) {
    const { lang, category } = await params;
    const { page } = await searchParams;
    const pageNum = page ? parseInt(page) : 1;
    const pageSize = 12;

    const supabase = await createClient();
    const { data: categoryData, error: catError } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', category)
        .single();

    // Fallback title if category lookup fails
    const categoryName = categoryData?.name || category.replace(/-/g, ' ');

    let articles: any[] = [];
    let count: number | null = 0;
    let errorMsg: string | null = null;

    // Fetch articles
    // If we have an ID, use it (more robust). If not, try slug.
    const filterValue = categoryData?.id || category;

    const result = await getArticlesByCategory(lang, filterValue, pageNum, pageSize);
    articles = result.data;
    count = result.count;
    if (result.error) {
        errorMsg = JSON.stringify(result.error);
        console.error("Error fetching articles:", result.error);
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold capitalize">{categoryName}</h1>
                {categoryData?.description && (
                    <p className="text-muted-foreground mt-2">{categoryData.description}</p>
                )}
                {/* Debug info if things go wrong */}
                {!categoryData && (
                    <div className="text-xs text-muted-foreground mt-2">
                        Debug: Category lookup failed or returned null. Slug: {category}. Error: {catError?.message}
                    </div>
                )}
            </div>

            {errorMsg && (
                <div className="p-4 bg-red-100 text-red-900 rounded mb-6">
                    Error loading articles: {errorMsg}
                </div>
            )}

            {articles.length === 0 && !errorMsg ? (
                <p className="text-muted-foreground">No articles found in this category.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((article: any) => (
                        <article key={article.id} className="border rounded-lg overflow-hidden flex flex-col hover:shadow-lg transition bg-card text-card-foreground">
                            <div className="p-6 flex-1 flex flex-col">
                                <Link href={`/${lang}/conteudos/${category}/${article.translation.slug}`} className="hover:text-primary transition-colors">
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
