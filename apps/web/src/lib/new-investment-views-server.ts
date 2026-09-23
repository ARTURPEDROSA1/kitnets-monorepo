/**
 * Builds the two views of Projetos — the list and one project's dashboard — for whoever asks:
 * the API routes (`GET /api/investments`, `GET /api/investments/[id]`) and the page itself, which
 * preloads them on the server so the first paint already has the data instead of showing
 * "Carregando…" while the browser makes a second, cold, authenticated round trip.
 *
 * Everything the bucket serves is signed in one storage call per view.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import { INVESTMENT_DOCUMENTS_BUCKET, loadInvestmentBundle, loadInvestmentList } from "@/lib/new-investments-server";
import { cardPhotoPaths, computeInvestmentMetrics, toCardSummary } from "@/lib/new-investment-metrics";
import { loadInvestmentBenchmarks } from "@/lib/new-investment-benchmarks-server";
import { signStorageUrls } from "@/lib/storage";
import type { ProjectDashboardView, ProjectListView } from "@/lib/new-investment-views";

export async function loadProjectList(supabase: AdminSupabase, profileId: string): Promise<ProjectListView> {
    const { investments, schedules, payments, documentCounts, photoPaths } = await loadInvestmentList(supabase, profileId);

    // The cover first, then the other photos — all signed in one storage call for the whole list.
    const pathsByInvestment = new Map(
        investments.map(investment => [investment.id, cardPhotoPaths(investment.cover_path, photoPaths.get(investment.id) ?? [])])
    );
    const signed = await signStorageUrls(supabase, INVESTMENT_DOCUMENTS_BUCKET, Array.from(pathsByInvestment.values()).flat());

    const summaries = investments.map(investment => {
        const own = schedules.filter(s => s.investment_id === investment.id);
        const ownPayments = payments.filter(p => p.investment_id === investment.id);
        const metrics = computeInvestmentMetrics(investment, own, ownPayments);
        const photoUrls = (pathsByInvestment.get(investment.id) ?? []).map(path => signed.get(path)).filter((url): url is string => Boolean(url));
        return toCardSummary(investment.id, metrics, documentCounts.get(investment.id) ?? 0, photoUrls);
    });

    return { investments, summaries };
}

export async function loadProjectDashboard(supabase: AdminSupabase, investmentId: string, profileId: string): Promise<ProjectDashboardView> {
    const [bundle, benchmarks] = await Promise.all([loadInvestmentBundle(supabase, investmentId, profileId), loadInvestmentBenchmarks(supabase)]);
    const signed = await signStorageUrls(supabase, INVESTMENT_DOCUMENTS_BUCKET, bundle.documents.map(d => d.storage_path));
    return {
        ...bundle,
        documents: bundle.documents.map(doc => ({ ...doc, url: signed.get(doc.storage_path) ?? null })),
        metrics: computeInvestmentMetrics(bundle.investment, bundle.schedules, bundle.payments),
        benchmarks,
    };
}
