import InquilinosContent from "./InquilinosContent";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
    return {
        title: 'Inquilinos',
        description: 'Cadastre e gerencie seus inquilinos no Kitnets.com.',
    };
}

export default async function InquilinosPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;

    return <InquilinosContent lang={lang} />;
}
