/**
 * Keeps crawlers off the query-string variants of the FipeZAP city pages. Every link on those pages
 * carries the reader's state (?comparar=, ?tipo=, ?periodo=…), and the "+ city" chips add one more city
 * to the comparison, so a bot following links met an endless set of URLs, each a full server render
 * (the page reads searchParams, so nothing is cached). In 2026-09 that crawl spent the whole Vercel
 * Hobby quota in two days and paused kitnets.com. Crawlers get a 301 to the canonical URL instead;
 * people keep the query state. Pure: the middleware passes the path, the query and the user agent.
 */

/** /indices/fipezap/cidades and /indices/fipezap/cidades/<cidade>, with or without the locale prefix. */
const CITIES_PATH = /^(\/(pt|en|es))?\/indices\/fipezap\/cidades(\/[^/]+)?\/?$/;

/** Search engines, AI crawlers, SEO tools and scripted clients. Browsers never match. */
const CRAWLER_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|meta-externalagent|perplexity|anthropic-ai|claude-web|headlesschrome|python-requests|python-urllib|scrapy|go-http-client|curl\/|wget\//i;

export function isCrawler(userAgent: string | null | undefined): boolean {
    return Boolean(userAgent && CRAWLER_UA.test(userAgent));
}

/**
 * True when the request is a crawler asking for a FipeZAP city page with reader state in the query.
 * `_rsc` alone is Next's own router fetch, not reader state, so it passes through.
 */
export function isCrawlerQueryTrap(pathname: string, search: string, userAgent: string | null | undefined): boolean {
    if (!CITIES_PATH.test(pathname)) return false;
    const keys = [...new URLSearchParams(search).keys()].filter(k => k !== "_rsc");
    return keys.length > 0 && isCrawler(userAgent);
}
