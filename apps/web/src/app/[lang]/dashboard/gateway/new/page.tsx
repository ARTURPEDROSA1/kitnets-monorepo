"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { Button } from "@kitnets/ui";
import { ArrowLeft, Router as RouterIcon, Loader2, CheckCircle2, AlertTriangle, Wifi, Shield, Zap } from "lucide-react";
import Link from "next/link";

export default function AddGatewayPage() {
    const params = useParams();
    const lang = params.lang as string;
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();

    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const formatCode = (value: string) => {
        // Auto-format to GW-XXXX-XXXX pattern
        const clean = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
        return clean;
    };

    const handleClaim = async () => {
        if (!user || !code.trim()) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/gateways/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: code.trim(),
                    userId: user.id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // Map API errors to user-friendly messages
                if (res.status === 404) {
                    if (data.error === "User profile not found") {
                        setError("Perfil não encontrado. Por favor, salve seu perfil primeiro em 'Meu Perfil'.");
                    } else {
                        setError("Código de gateway inválido. Verifique o código na etiqueta do seu dispositivo.");
                    }
                } else if (res.status === 409) {
                    setError("Este gateway já foi registrado por outro usuário.");
                } else {
                    setError(data.error || "Erro ao conectar gateway. Tente novamente.");
                }
                return;
            }

            setSuccess(true);

            // Redirect to dashboard after 2 seconds
            setTimeout(() => {
                router.push(`/${lang}/dashboard`);
            }, 2000);

        } catch (err) {
            console.error("Claim error:", err);
            setError("Erro de conexão. Verifique sua internet e tente novamente.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back link */}
            <Link
                href={`/${lang}/dashboard`}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para Dashboard
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 mb-4">
                    <RouterIcon className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Adicionar Gateway</h1>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                    Conecte seu Gateway Kitnet para monitorar consumo de água, gás e luz em tempo real.
                </p>
            </div>

            {/* Main Card */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                {/* Success State */}
                {success ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground mb-2">Gateway Conectado!</h2>
                        <p className="text-muted-foreground">
                            Seu gateway foi registrado com sucesso. Redirecionando para o dashboard...
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Input Section */}
                        <div className="p-8">
                            <label className="block text-sm font-semibold text-foreground mb-2">
                                Código do Gateway
                            </label>
                            <p className="text-sm text-muted-foreground mb-4">
                                Insira o código localizado na etiqueta do seu dispositivo Gateway Kitnet.
                            </p>

                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(formatCode(e.target.value))}
                                        placeholder="ex: GW-TEST-001"
                                        className="w-full px-4 py-3 text-lg font-mono tracking-wider border border-input rounded-xl bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                                        disabled={isLoading}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && code.trim()) handleClaim();
                                        }}
                                    />
                                    {code && !isLoading && (
                                        <button
                                            onClick={() => setCode("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <Button
                                    onClick={handleClaim}
                                    disabled={isLoading || !code.trim()}
                                    className="px-6 py-3 h-auto text-base font-semibold"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Conectando...
                                        </>
                                    ) : (
                                        "Conectar"
                                    )}
                                </Button>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="mt-4 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-border" />

                        {/* Info Section */}
                        <div className="p-8 bg-muted/30">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Como funciona</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">1. Código Único</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Cada gateway possui um código único impresso na etiqueta do dispositivo.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">2. Registro Instantâneo</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Ao inserir o código, o gateway é vinculado à sua conta imediatamente.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">3. Dados em Tempo Real</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Após o registro, os dados de consumo aparecem automaticamente no dashboard.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Help text */}
            {!success && (
                <p className="text-center text-xs text-muted-foreground mt-6">
                    Não encontrou o código? Verifique a parte inferior ou traseira do dispositivo Gateway Kitnet.
                    <br />
                    Em caso de dúvidas, entre em contato pelo{" "}
                    <a href="mailto:contato@kitnets.com" className="text-primary hover:underline">
                        contato@kitnets.com
                    </a>
                </p>
            )}
        </div>
    );
}
