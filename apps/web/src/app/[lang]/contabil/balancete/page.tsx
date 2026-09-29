import BalanceteContent from "./BalanceteContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function generateMetadata() {
    return {
        title: "Balancete · Contábil & Fiscal",
        description: "Balancete de verificação da holding: saldo anterior, débitos, créditos e saldo atual de cada conta.",
    };
}

export default async function BalancetePage({ params, searchParams }: { params: Promise<{ lang: "en" | "pt" | "es" }>; searchParams: Promise<{ from?: string; to?: string }> }) {
    const { lang } = await params;
    const { from, to } = await searchParams;
    return <BalanceteContent lang={lang} initialFrom={from && MONTH.test(from) ? from : null} initialTo={to && MONTH.test(to) ? to : null} />;
}
