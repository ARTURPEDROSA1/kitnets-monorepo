/**
 * The two shapes the Projetos pages render — the list and one project's dashboard — as the
 * server builds them and the client consumes them. Types only, so client components can import
 * them without pulling the server loader (Supabase, `next/cache`) into the browser bundle.
 */
import type { InvestmentDocument, InvestmentPayment, InvestmentSchedule, NewInvestment } from "./new-investments";
import type { InvestmentBenchmarks, InvestmentCardSummary, InvestmentMetrics } from "./new-investment-metrics";

/** A document with the short-lived signed URL the private bucket needs. */
export type DocumentWithUrl = InvestmentDocument & { url: string | null };

export interface ProjectListView {
    investments: NewInvestment[];
    summaries: InvestmentCardSummary[];
}

export interface ProjectDashboardView {
    investment: NewInvestment;
    schedules: InvestmentSchedule[];
    payments: InvestmentPayment[];
    documents: DocumentWithUrl[];
    metrics: InvestmentMetrics;
    benchmarks: InvestmentBenchmarks;
}
