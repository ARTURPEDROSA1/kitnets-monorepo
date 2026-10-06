import { Roboto } from "next/font/google";
import Link from "next/link";
import { UUID_REGEX } from "@/lib/api-auth";
import ContractDocumentScreen from "@/components/contratos/documento/ContractDocumentScreen";

export const dynamic = "force-dynamic";

// the document's typeface, the same the PDF embeds
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], style: ["normal", "italic"], variable: "--font-contract", display: "swap" });

export async function generateMetadata() {
    return {
        title: "Documento do contrato",
        description: "O contrato de locação escrito a partir do cadastro: revisar, editar, aceitar, gerar o PDF e assinar pelo gov.br.",
    };
}

export default async function ContratoDocumentoPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ id?: string | string[]; novo?: string | string[] }> }) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const id = typeof query.id === "string" ? query.id : "";
    if (!UUID_REGEX.test(id)) {
        return (
            <div className="mx-auto max-w-lg py-16 text-center text-sm text-muted-foreground">
                Contrato não informado. <Link href={`${lang === "pt" ? "" : `/${lang}`}/contratos`} className="text-sky-700 underline">Voltar aos contratos</Link>
            </div>
        );
    }
    return (
        <div className={roboto.variable}>
            <ContractDocumentScreen leaseId={id} lang={lang} isNew={query.novo === "1"} />
        </div>
    );
}
