"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Error boundary for every page under /[lang]. Reports to Sentry and offers
 * a retry without losing the shell (sidebar/footer stay mounted).
 */
export default function LangError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const params = useParams<{ lang?: string }>();
    const lang = params?.lang ?? "pt";

    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    const t =
        lang === "en"
            ? { title: "Something went wrong", body: "An unexpected error occurred. We've been notified.", retry: "Try again", home: "Back to dashboard", code: "Code" }
            : lang === "es"
            ? { title: "Algo salió mal", body: "Ocurrió un error inesperado. Ya fuimos notificados.", retry: "Intentar de nuevo", home: "Volver al panel", code: "Código" }
            : { title: "Algo deu errado", body: "Ocorreu um erro inesperado. Já fomos avisados e vamos investigar.", retry: "Tentar novamente", home: "Voltar ao painel", code: "Código" };

    return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h1 className="text-xl font-semibold text-foreground">{t.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t.body}</p>
                {error.digest ? (
                    <p className="mt-2 text-xs text-muted-foreground/70 font-mono">
                        {t.code}: {error.digest}
                    </p>
                ) : null}
                <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                        onClick={() => reset()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        <RotateCcw className="w-4 h-4" />
                        {t.retry}
                    </button>
                    <Link
                        href={`/${lang}/dashboard`}
                        className="inline-flex items-center px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                        {t.home}
                    </Link>
                </div>
            </div>
        </div>
    );
}
