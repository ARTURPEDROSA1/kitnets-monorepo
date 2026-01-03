"use client";

import React from "react";
import { Button } from "@kitnets/ui";
import { ArrowRight, BrainCircuit, LineChart, ShieldCheck, UserRound, Building2, KeyRound } from "lucide-react";
import { useWaitlist } from "./WaitlistContext";

export function Step0Landing() {
    const { nextStep } = useWaitlist();

    return (
        <div className="min-h-screen bg-background text-foreground animate-in fade-in duration-700">
            {/* Hero Section */}
            <div className="relative overflow-hidden pt-12 pb-24 lg:pt-20 lg:pb-32">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-center">
                    <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-500 mb-8 backdrop-blur-sm">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                        Lista de Espera Aberta
                    </div>

                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground/50 max-w-4xl mx-auto leading-[1.1]">
                        Plataforma de gestão de aluguéis com <span className="text-emerald-500">Inteligência Artificial</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                        Automação, dados e inteligência para quem vive, investe, aluga e constrói.
                    </p>

                    <Button
                        onClick={nextStep}
                        className="h-14 px-8 text-lg font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-105 active:scale-95"
                    >
                        Entrar na lista de espera <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </div>

                {/* Abstract decorative elements */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 rounded-full blur-3xl -z-10"></div>
            </div>

            {/* Intro Section */}
            <section className="py-20 md:py-32 bg-card/30 dark:bg-zinc-900/20 border-y border-border/50">
                <div className="container px-4 md:px-6 mx-auto">
                    <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
                        <div>
                            <h2 className="text-3xl font-bold mb-6">Feito para compactos</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                                O <span className="font-semibold text-emerald-500">Kitnets.com</span> está criando uma plataforma de gestão de aluguéis com Inteligência Artificial, desenvolvida especialmente para kitnets, studios e imóveis compactos.
                            </p>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Mais do que um portal de anúncios, é um software online profissional que organiza dados, automatiza processos e transforma imóveis em ativos geridos com inteligência — algo que, até hoje, estava restrito a grandes operações.
                            </p>
                        </div>
                        <div className="relative aspect-square md:aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500/10 to-transparent border border-white/5 shadow-2xl backdrop-blur-sm p-8 flex items-center justify-center">
                            <BrainCircuit className="w-32 h-32 text-emerald-500/40" />
                            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Problem/Solution Section */}
            <section className="py-20 md:py-32">
                <div className="container px-4 md:px-6 mx-auto max-w-4xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold mb-4">Por que uma plataforma com IA muda tudo?</h2>
                        <p className="text-muted-foreground text-lg">A gestão tradicional de aluguéis ainda depende de planilhas manuais e processos repetitivos.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="p-8 rounded-2xl bg-destructive/5 border border-destructive/10">
                            <h3 className="text-xl font-bold mb-4 text-destructive/80 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-destructive"></span> Gestão Tradicional
                            </h3>
                            <ul className="space-y-4 text-muted-foreground">
                                <li className="flex items-start gap-3">
                                    <span className="text-destructive/50 mt-1">✕</span> Planilhas manuais e propensas a erro
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-destructive/50 mt-1">✕</span> Informações espalhadas em vários lugares
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-destructive/50 mt-1">✕</span> Decisões tomadas sem dados confiáveis
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-destructive/50 mt-1">✕</span> Imprevisibilidade financeira
                                </li>
                            </ul>
                        </div>

                        <div className="p-8 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 relative shadow-xl">
                            <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">O NOVO PADRÃO</div>
                            <h3 className="text-xl font-bold mb-4 text-emerald-500 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Com Kitnets.com
                            </h3>
                            <ul className="space-y-4 text-muted-foreground">
                                <li className="flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" /> Controle centralizado de contratos
                                </li>
                                <li className="flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" /> Histórico organizado e acessível
                                </li>
                                <li className="flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" /> Visão clara da rentabilidade real
                                </li>
                                <li className="flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" /> Base preparada para automação
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 text-center">
                        <p className="text-lg font-medium mb-6">Menos improviso. Mais previsibilidade. Mais eficiência.</p>
                        <Button
                            onClick={nextStep}
                            variant="outline"
                            className="border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-500"
                        >
                            Quero operar como profissional
                        </Button>
                    </div>
                </div>
            </section>

            {/* Target Audience Section */}
            <section className="py-20 md:py-32 bg-card/30 dark:bg-zinc-900/20 border-y border-border/50">
                <div className="container px-4 md:px-6 mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-16">Um diferencial enorme para quem quer crescer</h2>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="p-6 rounded-2xl bg-background border border-border hover:border-emerald-500/30 transition-all hover:shadow-lg">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6">
                                <UserRound className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Pessoa Física</h3>
                            <p className="text-sm text-muted-foreground mb-4">Proprietários com poucos imóveis</p>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex gap-2">✓ Organização total</li>
                                <li className="flex gap-2">✓ Controle profissional</li>
                                <li className="flex gap-2">✓ Melhores decisões</li>
                            </ul>
                        </div>

                        <div className="p-6 rounded-2xl bg-background border border-border hover:border-emerald-500/30 transition-all hover:shadow-lg">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-6">
                                <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Holdings e Investidores</h3>
                            <p className="text-sm text-muted-foreground mb-4">Gestão de patrimônio (PJ)</p>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex gap-2">✓ Visão consolidada</li>
                                <li className="flex gap-2">✓ Métricas comparáveis</li>
                                <li className="flex gap-2">✓ Base para crescimento</li>
                            </ul>
                        </div>

                        <div className="p-6 rounded-2xl bg-background border border-border hover:border-emerald-500/30 transition-all hover:shadow-lg">
                            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-6">
                                <KeyRound className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Imobiliárias e Corretores</h3>
                            <p className="text-sm text-muted-foreground mb-4">Gestão de terceiros</p>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex gap-2">✓ Operação eficiente</li>
                                <li className="flex gap-2">✓ Menos retrabalho</li>
                                <li className="flex gap-2">✓ Escalabilidade</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* AI Section */}
            <section className="py-20 md:py-32">
                <div className="container px-4 md:px-6 mx-auto flex flex-col items-center text-center max-w-4xl">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-8 animate-pulse">
                        <LineChart className="w-8 h-8 text-emerald-500" />
                    </div>

                    <h2 className="text-3xl font-bold mb-6">Inteligência Artificial aplicada à gestão</h2>
                    <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
                        O Kitnets.com foi projetado desde o início para a era da IA. Não é apenas um sistema para registrar informações. É uma plataforma que aprende com os dados do mercado.
                    </p>

                    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-left w-full">
                        <div className="p-4 rounded-xl bg-muted/50 border border-border">
                            <h4 className="font-bold text-emerald-500 mb-1">01</h4>
                            <p className="text-sm font-medium">Dados estruturados</p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/50 border border-border">
                            <h4 className="font-bold text-emerald-500 mb-1">02</h4>
                            <p className="text-sm font-medium">Automação de rotinas</p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/50 border border-border">
                            <h4 className="font-bold text-emerald-500 mb-1">03</h4>
                            <p className="text-sm font-medium">Relatórios inteligentes</p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/50 border border-border">
                            <h4 className="font-bold text-emerald-500 mb-1">04</h4>
                            <p className="text-sm font-medium">Evolução contínua</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 md:py-32 bg-emerald-900/10 border-y border-emerald-500/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90 z-0"></div>
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-center max-w-3xl">
                    <h2 className="text-3xl md:text-5xl font-bold mb-8">Por que entrar na lista de espera?</h2>

                    <div className="grid sm:grid-cols-2 gap-4 text-left mb-12 max-w-2xl mx-auto">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-muted-foreground">Acesso antecipado à plataforma</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-muted-foreground">Prioridade no onboarding</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-muted-foreground">Condições especiais de lançamento</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-muted-foreground">Participação como usuário fundador</span>
                        </div>
                    </div>

                    <div className="bg-background border border-emerald-500/30 p-8 rounded-2xl shadow-2xl">
                        <p className="text-xl font-medium mb-2">Comece agora</p>
                        <p className="text-muted-foreground mb-8 text-sm">
                            Solicitamos CPF ou CNPJ para validar perfis e garantir um ambiente confiável.
                        </p>
                        <Button
                            onClick={nextStep}
                            className="w-full sm:w-auto h-14 px-10 text-lg font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Entrar na lista de espera
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
