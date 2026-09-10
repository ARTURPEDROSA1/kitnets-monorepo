"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";

function DocumentoViewerInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const targetUrl = searchParams.get("url") || "";
    const title = searchParams.get("title") || "Visualizador de Documento";
    const fileName = searchParams.get("name") || "documento.pdf";

    if (!targetUrl) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
                <FileText className="w-12 h-12 text-muted-foreground" />
                <h1 className="text-xl font-bold text-foreground">Nenhum documento especificado</h1>
                <p className="text-sm text-muted-foreground max-w-md">
                    O link acessado não contém a URL do documento para visualização dentro do Kitnets.
                </p>
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-sm"
                >
                    Voltar
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-4 sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1 text-sm font-medium cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Voltar</span>
                    </button>
                    <div className="w-px h-5 bg-border hidden sm:block" />
                    <div>
                        <h1 className="text-sm font-bold text-foreground truncate max-w-xs sm:max-w-md">
                            {title}
                        </h1>
                        <p className="text-xs text-muted-foreground">Kitnets.com • Visualização de Documento</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <a
                        href={`/api/pdf-proxy?url=${encodeURIComponent(targetUrl)}`}
                        download={fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar</span>
                    </a>
                </div>
            </header>

            {/* Embedded In-App Viewer Modal */}
            <PdfViewerModal
                isOpen={true}
                onClose={() => router.back()}
                url={targetUrl}
                title={title}
                fileName={fileName}
            />
        </div>
    );
}

export default function DocumentoViewerPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                    <p className="text-sm text-muted-foreground">Carregando visualizador...</p>
                </div>
            }
        >
            <DocumentoViewerInner />
        </Suspense>
    );
}
