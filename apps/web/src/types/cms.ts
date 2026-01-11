export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface Author {
    id: string;
    name: string;
    slug: string;
    avatar_url: string | null;
    bio: string | null;
    social_links: Record<string, string>;
    created_at: string;
    updated_at: string;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface Tag {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface Article {
    id: string;
    author_id: string;
    primary_category_id: string;
    status: ArticleStatus;
    published_at: string | null;
    updated_at: string;
    created_at: string;
    // Joins
    author?: Author;
    category?: Category;
    tags?: Tag[];
    translations?: ArticleTranslation[];
}

export interface ArticleTranslation {
    id: string;
    article_id: string;
    lang: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content_mdx: string;
    content_compiled: any | null; // Should be MDXRemoteSerializeResult from next-mdx-remote
    metadata: ArticleMetadata;
    reading_time_minutes: number | null;
    word_count: number | null;
    updated_at: string;
    created_at: string;
}

export interface ArticleMetadata {
    seo_title?: string;
    seo_description?: string;
    keywords?: string[];
    og_image_url?: string;
    canonical_url?: string;
    robots?: string;
}
