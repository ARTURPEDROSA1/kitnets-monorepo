/**
 * The tenant's signing page (app/[lang]/assinar/[token]): which contract it is, how many signatures it
 * has, and the three steps — download the PDF, sign it on gov.br, send the signed file back. A server
 * component; the upload is SignedCopyUpload (client).
 */
import React from "react";
import { CheckCircle2, ExternalLink, FileDown, FileSignature, ShieldCheck } from "lucide-react";
import { GOVBR_SIGNER_URL, GOVBR_VALIDATOR_URL } from "@/lib/contract/document";
import SignedCopyUpload from "./SignedCopyUpload";

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto w-full max-w-2xl space-y-4 py-2 sm:space-y-5 sm:px-4 sm:py-10">{children}</div>;
}

export function PublicContractNotFound({ reason }: { reason: "missing" | "limited" }) {
    return (
        <Shell>
            <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
                <FileSignature className="mx-auto h-10 w-10 text-muted-foreground" />
                <h1 className="mt-3 text-xl font-bold text-foreground">{reason === "limited" ? "Muitas tentativas" : "Link inválido ou expirado"}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {reason === "limited" ? "Aguarde alguns minutos e abra o link de novo." : "Este link não leva a nenhum contrato para assinar. Peça um novo link ao proprietário."}
                </p>
            </div>
        </Shell>
    );
}

interface Props {
    token: string;
    reference: string;
    ownerName: string;
    tenantFirstName: string | null;
    status: "ACCEPTED" | "SIGNED";
    signatureCount: number;
    requiredSignatures: number;
    expiresAt: string;
}

function Step({ n, title, children, done = false }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
    return (
        <li className="flex gap-3 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                {children}
            </div>
        </li>
    );
}

export default function PublicContractView({ token, reference, ownerName, tenantFirstName, status, signatureCount, requiredSignatures, expiresAt }: Props) {
    const signed = status === "SIGNED";
    const until = expiresAt.slice(0, 10).split("-").reverse().join("/");
    const pdfHref = `/api/assinar/${token}/pdf`;
    return (
        <Shell>
            <header className="rounded-2xl border border-border/80 bg-card p-4 sm:p-6">
                <div className="flex items-start gap-3">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 sm:flex"><FileSignature className="h-6 w-6" /></span>
                    <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">{tenantFirstName ? `Olá, ${tenantFirstName}!` : "Olá!"} {ownerName} enviou para assinatura:</p>
                        <h1 className="mt-0.5 text-lg font-bold leading-tight text-foreground sm:text-2xl">Contrato de locação · {reference}</h1>
                    </div>
                </div>
                <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Assinaturas</span>
                        <span>{Math.min(signatureCount, requiredSignatures)} de {requiredSignatures}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (signatureCount / Math.max(1, requiredSignatures)) * 100)}%` }} />
                    </div>
                </div>
            </header>

            {signed ? (
                <div className="space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="h-5 w-5" /> Contrato assinado por todas as partes.</p>
                    <a href={pdfHref} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><FileDown className="h-4 w-4" /> Baixar o contrato assinado</a>
                </div>
            ) : (
                <ol className="space-y-3">
                    <Step n={1} title="Baixe e leia o contrato">
                        <p className="text-sm text-muted-foreground">É a versão mais recente, com as assinaturas já feitas.</p>
                        <a href={pdfHref} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><FileDown className="h-4 w-4" /> Baixar o PDF</a>
                    </Step>
                    <Step n={2} title="Assine no gov.br">
                        <p className="text-sm text-muted-foreground">
                            Entre no assinador do gov.br com a sua conta (nível prata ou ouro), escolha o PDF baixado, posicione a assinatura na última página, confirme com o código que chega no app gov.br ou por SMS e baixe o arquivo assinado.
                        </p>
                        <a href={GOVBR_SIGNER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent"><ShieldCheck className="h-4 w-4 text-sky-600" /> Abrir o assinador gov.br <ExternalLink className="h-3.5 w-3.5 opacity-60" /></a>
                    </Step>
                    <Step n={3} title="Envie o PDF assinado">
                        <SignedCopyUpload token={token} required={requiredSignatures} />
                    </Step>
                </ol>
            )}

            <p className="px-1 text-xs text-muted-foreground">
                Link válido até {until}. A assinatura do gov.br tem validade jurídica (Lei nº 14.063/2020) e pode ser conferida em{" "}
                <a href={GOVBR_VALIDATOR_URL} target="_blank" rel="noopener noreferrer" className="underline">validar.iti.gov.br</a>. Dúvidas sobre o contrato: fale com {ownerName}.
            </p>
        </Shell>
    );
}
