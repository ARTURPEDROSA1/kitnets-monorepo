import { createClient } from '@/utils/supabase/server';
import { Article, ArticleTranslation, Author, Category, Tag } from '@/types/cms';

export type ArticleWithDetails = Article & {
    category: Category;
    author: Author;
    translation: ArticleTranslation; // The specific translation for the requested lang
    tags: Tag[];
};

export const getArticleBySlug = async (
    lang: string,
    categorySlug: string,
    slug: string
): Promise<ArticleWithDetails | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('articles')
        .select(`
      *,
      category:categories!articles_primary_category_id_fkey!inner(*),
      author:authors(*),
      translation:article_translations!inner(*),
      article_tags(tag:tags(*))
    `)
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .eq('category.slug', categorySlug)
        .eq('translation.lang', lang)
        .eq('translation.slug', slug)
        .single();

    if (error || !data) {
        if (error && error.code !== 'PGRST116') { // PGRST116 is "Relation null" (no rows)
            console.error('Error fetching article:', error);
        }
        return null;
    }

    // Transform tags
    const tags = data.article_tags.map((at: any) => at.tag);

    return {
        ...data,
        tags,
        translation: Array.isArray(data.translation) ? data.translation[0] : data.translation
    } as unknown as ArticleWithDetails;
};

export const getArticlesByCategory = async (
    lang: string,
    categorySlugOrId: string,
    page: number = 1,
    pageSize: number = 12
) => {
    const supabase = await createClient();
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    let query = supabase
        .from('articles')
        .select(`
      *,
      category:categories!articles_primary_category_id_fkey!inner(*),
      author:authors(*),
      translation:article_translations!inner(title, slug, excerpt, metadata, created_at, reading_time_minutes),
      article_tags(tag:tags(*))
    `, { count: 'exact' })
        .eq('status', 'published')
        // .lte('published_at', new Date().toISOString())
        .eq('translation.lang', lang)
        .order('published_at', { ascending: false })
        .range(start, end);

    // Check if UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categorySlugOrId);

    if (isUuid) {
        query = query.eq('primary_category_id', categorySlugOrId);
    } else {
        query = query.eq('category.slug', categorySlugOrId);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching articles by category:', error);
        return { data: [], count: 0, error };
    }

    const articles = data.map((d: any) => ({
        ...d,
        tags: d.article_tags.map((at: any) => at.tag),
        translation: Array.isArray(d.translation) ? d.translation[0] : d.translation,
    }));

    return { data: articles, count, error: null };
};

export const getArticlesByAuthor = async (
    lang: string,
    authorSlug: string,
    page: number = 1,
    pageSize: number = 12
) => {
    const supabase = await createClient();
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const { data, error, count } = await supabase
        .from('articles')
        .select(`
        *,
        category:categories!articles_primary_category_id_fkey(*),
        author:authors!inner(*),
        translation:article_translations!inner(title, slug, excerpt, metadata, created_at, reading_time_minutes),
        article_tags(tag:tags(*))
      `, { count: 'exact' })
        .eq('status', 'published')
        // .lte('published_at', new Date().toISOString())
        .eq('author.slug', authorSlug)
        .eq('translation.lang', lang)
        .order('published_at', { ascending: false })
        .range(start, end);

    if (error) {
        console.error('Error fetching articles by author:', error);
        return { data: [], count: 0 };
    }

    const articles = data.map((d: any) => ({
        ...d,
        tags: d.article_tags.map((at: any) => at.tag),
        translation: Array.isArray(d.translation) ? d.translation[0] : d.translation,
    }));

    return { data: articles, count };
};

export const getArticlesByTag = async (
    lang: string,
    tagSlug: string,
    page: number = 1,
    pageSize: number = 12
) => {
    const supabase = await createClient();
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    // Tag filtering needs to go through article_tags
    const { data, error, count } = await supabase
        .from('articles')
        .select(`
        *,
        category:categories!articles_primary_category_id_fkey(*),
        author:authors(*),
        translation:article_translations!inner(title, slug, excerpt, metadata, created_at, reading_time_minutes),
        article_tags!inner(tag:tags!inner(*)) 
      `, { count: 'exact' })
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .eq('article_tags.tag.slug', tagSlug)
        .eq('translation.lang', lang)
        .order('published_at', { ascending: false })
        .range(start, end);

    if (error) {
        console.error('Error fetching articles by tag:', error);
        return { data: [], count: 0 };
    }

    const articles = data.map((d: any) => ({
        ...d,
        tags: d.article_tags.map((at: any) => at.tag),
        translation: Array.isArray(d.translation) ? d.translation[0] : d.translation,
        // Note: !inner on article_tags ensures we only get articles with the tag,
        // but we might want to fetch ALL tags for the article, not just the matching one.
        // This query returns only the matching tag in article_tags array usually if using !inner this way on the join?
        // Supabase PostgREST might filter the nested resource.
        // To get all tags, we might need a separate join or handle it differently.
        // For now, simple implementation.
    }));

    return { data: articles, count };
};
