import { describe, expect, it } from "vitest";
import { isCrawler, isCrawlerQueryTrap } from "./crawler-guard";

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const BYTESPIDER = "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)";
const META = "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

describe("isCrawler", () => {
    it("recognises search engines, AI crawlers and scripted clients", () => {
        for (const ua of [GOOGLEBOT, GPTBOT, BYTESPIDER, META, "Mozilla/5.0 (compatible; bingbot/2.0)", "ClaudeBot/1.0", "PerplexityBot/1.0", "curl/8.4.0", "python-requests/2.32"]) {
            expect(isCrawler(ua)).toBe(true);
        }
    });
    it("leaves browsers alone", () => {
        expect(isCrawler(CHROME)).toBe(false);
        expect(isCrawler(IPHONE)).toBe(false);
        expect(isCrawler(null)).toBe(false);
        expect(isCrawler("")).toBe(false);
    });
});

describe("isCrawlerQueryTrap", () => {
    it("catches a crawler on a city page with reader state, with or without the locale", () => {
        expect(isCrawlerQueryTrap("/pt/indices/fipezap/cidades/sao-paulo", "?comparar=rio-de-janeiro,curitiba", GOOGLEBOT)).toBe(true);
        expect(isCrawlerQueryTrap("/indices/fipezap/cidades", "?tipo=locacao", GPTBOT)).toBe(true);
        expect(isCrawlerQueryTrap("/en/indices/fipezap/cidades/recife/", "?periodo=all", BYTESPIDER)).toBe(true);
    });
    it("lets people keep their state", () => {
        expect(isCrawlerQueryTrap("/pt/indices/fipezap/cidades/sao-paulo", "?comparar=curitiba", CHROME)).toBe(false);
    });
    it("lets crawlers read the canonical page and Next's own router fetches", () => {
        expect(isCrawlerQueryTrap("/pt/indices/fipezap/cidades/sao-paulo", "", GOOGLEBOT)).toBe(false);
        expect(isCrawlerQueryTrap("/pt/indices/fipezap/cidades/sao-paulo", "?_rsc=1x2y3", GOOGLEBOT)).toBe(false);
    });
    it("only covers the FipeZAP city pages", () => {
        expect(isCrawlerQueryTrap("/pt/indices/ipca", "?periodo=all", GOOGLEBOT)).toBe(false);
        expect(isCrawlerQueryTrap("/pt/indices/fipezap/cidades/sao-paulo/extra", "?tipo=venda", GOOGLEBOT)).toBe(false);
        expect(isCrawlerQueryTrap("/pt/calculadoras", "?x=1", GOOGLEBOT)).toBe(false);
    });
});
