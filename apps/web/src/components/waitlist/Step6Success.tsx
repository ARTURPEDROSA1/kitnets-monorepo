"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@kitnets/ui";

export function Step6Success() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-8 ring-1 ring-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-500" />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                Cadastro recebido com sucesso
            </h1>

            <p className="text-xl text-muted-foreground max-w-lg mb-8 leading-relaxed">
                Seu perfil foi registrado na lista de espera do SaaS Kitnets.com.
            </p>

            <div className="bg-card/50 dark:bg-zinc-900/50 border border-border dark:border-white/10 rounded-2xl p-6 max-w-md w-full mb-10 text-left">
                <p className="text-foreground dark:text-zinc-300 font-medium mb-4">Seu CPF/CNPJ será utilizado apenas para:</p>
                <ul className="space-y-3">
                    <li className="flex gap-3 text-muted-foreground dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                        Validação do perfil
                    </li>
                    <li className="flex gap-3 text-muted-foreground dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                        Ativação de recursos profissionais
                    </li>
                    <li className="flex gap-3 text-muted-foreground dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                        Conformidade legal e contratual
                    </li>
                </ul>
            </div>

            <p className="text-muted-foreground text-sm mb-8">
                Você será avisado(a) assim que o acesso antecipado estiver disponível.
            </p>

            <Button asChild variant="outline" className="h-12 border-input hover:bg-accent hover:text-accent-foreground text-muted-foreground">
                <Link href="/">
                    Voltar para o site
                </Link>
            </Button>
        </div>
    );
}
