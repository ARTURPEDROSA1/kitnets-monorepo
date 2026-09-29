import SaldoAberturaContent from "./SaldoAberturaContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: "Saldo de abertura · Contábil & Fiscal",
        description: "Os saldos das contas patrimoniais da holding no início da escrituração na Kitnets.com.",
    };
}

export default async function SaldoAberturaPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <SaldoAberturaContent lang={lang} />;
}
