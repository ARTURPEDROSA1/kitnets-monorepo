"use client";

/**
 * Contábil & Fiscal › Contas bancárias.
 *
 * The holding's bank account is the source for the accounting side (DRE,
 * balanço, impostos). The Banco Inter API sync needs the company's API
 * credentials; until they are configured this page explains the flow and
 * points to the statement import that already works per property.
 */
import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, FileSpreadsheet, KeyRound, Landmark, ShieldCheck } from "lucide-react";

interface Props { lang: "en" | "pt" | "es" }

const STEPS: Array<{ title: string; detail: string; done: boolean }> = [
    { title: "Classificador de extrato", detail: "Prestação, amortização, quitação, tarifa, IPTU, utilidades, reforma e energia solar reconhecidos pelo histórico do lançamento.", done: true },
    { title: "Importação de extrato OFX/CSV por imóvel", detail: "Disponível em Imóveis › Investimento no imóvel › Importar extrato, com revisão antes de gravar.", done: true },
    { title: "Credenciais da API do Banco Inter", detail: "Certificado mTLS e chave privada, client id e client secret da aplicação, agência e conta. Guardados como segredos no servidor, nunca no navegador.", done: false },
    { title: "Sincronização diária", detail: "Busca os lançamentos da conta, classifica, remove duplicados pelo identificador do banco e deixa os novos para revisão.", done: false },
    { title: "Receitas de cada imóvel", detail: "Entradas (PIX/TED do inquilino) casadas com o imóvel viram meses em Receitas de Aluguel com origem BANK; saídas classificadas vão para o registro de investimento do imóvel.", done: false },
    { title: "Plano de contas da holding", detail: "Cada lançamento vira uma conta contábil (receita de aluguel, despesas, financiamento, impostos) para gerar DRE, balanço e apuração de impostos.", done: false },
];

export default function ContasBancariasContent({ lang }: Props) {
    const base = lang === "pt" ? "" : `/${lang}`;
    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contábil &amp; Fiscal</p>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Landmark className="w-8 h-8 text-emerald-600" /> Contas bancárias
                </h1>
                <p className="text-base text-muted-foreground">
                    A conta da holding é a fonte de tudo que é contábil: DRE, balanço patrimonial e impostos. Conectada ao banco, cada lançamento é classificado automaticamente, casado com o imóvel (receitas de aluguel e custos) e revisado por você antes de entrar nos livros.
                </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h2 className="font-bold text-base text-foreground">Banco Inter · conta PJ</h2>
                            <p className="text-xs text-muted-foreground">Integração via API oficial do Inter (Open Finance). Somente leitura do extrato.</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                            <Circle className="w-3 h-3" /> Não conectada
                        </span>
                    </div>
                    <ol className="space-y-3">
                        {STEPS.map(s => (
                            <li key={s.title} className="flex items-start gap-3">
                                {s.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
                                <div>
                                    <p className={`text-sm font-semibold ${s.done ? "text-foreground" : "text-muted-foreground"}`}>{s.title}</p>
                                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground flex items-start gap-3">
                        <KeyRound className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                        <p>
                            Para ativar a conexão, as credenciais da aplicação Inter (certificado, chave, client id/secret e conta) são configuradas como segredos do servidor pela equipe Kitnets.com. Nenhuma senha de internet banking é usada ou armazenada.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Enquanto isso</h3>
                        <p className="text-xs text-muted-foreground">Exporte o extrato do banco em OFX ou CSV e importe no imóvel: as saídas viram lançamentos do investimento após a sua revisão.</p>
                        <Link href={`${base}/imoveis`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
                            Ir para Imóveis <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-2">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-600" /> O que vem a seguir</h3>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                            <li>DRE mensal e anual da holding</li>
                            <li>Balanço patrimonial com os imóveis pelo valor de mercado</li>
                            <li>Apuração de impostos (Simples, Lucro Presumido) a partir dos lançamentos</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
