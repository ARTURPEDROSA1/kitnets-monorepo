"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself.
 * Must render its own <html>/<body> because the root layout is gone.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="pt-BR">
            <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f8fafc", color: "#0f172a" }}>
                <main style={{ maxWidth: 480, margin: "15vh auto", padding: "0 24px", textAlign: "center" }}>
                    <h1 style={{ fontSize: 22, marginBottom: 8 }}>Algo deu errado</h1>
                    <p style={{ color: "#475569", lineHeight: 1.5 }}>
                        Ocorreu um erro inesperado. Já fomos avisados e vamos investigar.
                        {error.digest ? (
                            <>
                                <br />
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>Código: {error.digest}</span>
                            </>
                        ) : null}
                    </p>
                    <button
                        onClick={() => reset()}
                        style={{
                            marginTop: 16,
                            padding: "10px 18px",
                            borderRadius: 8,
                            border: 0,
                            background: "#0f766e",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Tentar novamente
                    </button>
                </main>
            </body>
        </html>
    );
}
