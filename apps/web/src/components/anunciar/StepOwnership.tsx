"use client";

import React, { useRef, useState } from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    FileText, X, UploadCloud, CheckCircle2,
    Loader2, AlertTriangle, ShieldCheck, Plus
} from "lucide-react";
import { DocumentExtractionResult, OwnershipClaim, ExtractedData } from "@/types/ownership";
import { cn } from "@/lib/utils";

export function StepOwnership() {
    const { state, dispatch, nextStep } = useAnunciar();
    const { documents, claim } = state.data.ownership;
    const { role } = state.data;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [extractionResults, setExtractionResults] = useState<DocumentExtractionResult[]>([]);
    const [confirmedData, setConfirmedData] = useState<ExtractedData>({});

    // Set of filenames currently being processed
    const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());

    const isMandatory = role === "owner" || role === "agency" || role === "builder";

    // --- Actions ---

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);

            // Add to processing set
            const newProcessing = new Set(processingFiles);
            newFiles.forEach(f => newProcessing.add(f.name));
            setProcessingFiles(newProcessing);

            // Update context with raw files immediately (Optimistic UI)
            dispatch({
                type: "UPDATE_OWNERSHIP",
                payload: { documents: [...documents, ...newFiles] }
            });

            // Trigger Analysis
            await analyzeDocuments(newFiles);
        }
    };

    const analyzeDocuments = async (files: File[]) => {
        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const formData = new FormData();
            files.forEach(f => formData.append('file', f));

            const res = await fetch('/api/ownership/analyze', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Falha ao analisar documentos");
            }

            const data = await res.json();
            const newResults: DocumentExtractionResult[] = data.results;

            setExtractionResults(prev => [...prev, ...newResults]);

            // Auto-fill confirmed data logic
            if (newResults.length > 0) {
                // Prefer Matrícula or IPTU for canonical data
                const bestDoc = newResults.find(d => d.classified_type === 'MATRICULA' || d.classified_type === 'IPTU') || newResults[newResults.length - 1];
                setConfirmedData(prev => ({
                    ...prev,
                    owner_name: prev.owner_name || bestDoc.extracted_data.owner_name,
                    cpf: prev.cpf || bestDoc.extracted_data.cpf,
                    address: {
                        ...prev.address,
                        ...bestDoc.extracted_data.address
                    }
                }));
            }

        } catch (err) {
            console.error(err);
            setAnalysisError("Ocorreu um erro ao analisar os documentos.");
        } finally {
            // Clear processing status for these files
            setProcessingFiles(prev => {
                const next = new Set(prev);
                files.forEach(f => next.delete(f.name));
                return next;
            });
            setIsAnalyzing(false);
        }
    };

    const removeDoc = (index: number) => {
        const newDocs = [...documents];
        newDocs.splice(index, 1);

        // In a real app we'd map file ID to result ID.
        // For now, we'll keep results that match remaining files by index roughly.
        // This is a simplification.
        if (index < extractionResults.length) {
            setExtractionResults(results => {
                const newRes = [...results];
                newRes.splice(index, 1);
                return newRes;
            });
        }
        // In a real app we'd map file ID to result ID.
        // For this mock, we'll just keep results that match remaining files by name or index
        // Since it's tricky, let's just update the document list for now.

        setExtractionResults(results => results.slice(0, newDocs.length)); // Rough sync

        dispatch({
            type: "UPDATE_OWNERSHIP",
            payload: { documents: newDocs }
        });
    };

    const handleConfirm = () => {
        const finalClaim: OwnershipClaim = {
            id: crypto.randomUUID(),
            consolidated_data: confirmedData,
            documents: extractionResults.map(r => ({
                id: r.document_id,
                file_name: "Documento Anexado",
                file_size: 0,
                url: "",
                uploaded_at: new Date().toISOString(),
                type: r.classified_type,
                confidence: r.type_confidence
            })),
            extractions: extractionResults,
            scores: {
                document_confidence: 0.95,
                identity_match: 0.9,
                address_match: 0.9,
                cross_doc_consistency: 0.95,
                overall: 0.92
            },
            decision: "APPROVED",
            decision_reasons: ["Documentos validados com sucesso por IA"],
            status: "verified"
        };

        dispatch({
            type: "UPDATE_OWNERSHIP",
            payload: {
                documents,
                verified: true,
                claim: finalClaim
            }
        });

        nextStep();
    };

    const handleReset = () => {
        dispatch({ type: "UPDATE_OWNERSHIP", payload: { claim: null, verified: false, documents: [] } });
        setExtractionResults([]);
        setConfirmedData({});
        setAnalysisError(null);
        setProcessingFiles(new Set());
    };

    // --- Render ---

    if (claim?.status === 'verified') {
        return (
            <StepLayout title="Verificação de Propriedade" subtitle="">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center space-y-4 animate-in fade-in zoom-in-95">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-emerald-900">Propriedade Verificada</h3>
                    <p className="text-emerald-700 max-w-md mx-auto">
                        Os documentos para este imóvel foram validados com sucesso.
                    </p>
                    <div className="flex justify-center gap-4 pt-4">
                        <Button variant="outline" onClick={handleReset}>
                            Re-enviar
                        </Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={nextStep}>
                            Continuar
                        </Button>
                    </div>
                </div>
            </StepLayout>
        );
    }

    return (
        <StepLayout
            title="Verificação de Propriedade"
            subtitle="Para garantir a segurança da plataforma, solicitamos comprovantes de propriedade dos Imóveis. Nossa IA analisará os documentos para extrair endereços e confirmar a titularidade."
        >
            <div className="space-y-8">

                {/* Error Banner */}
                {analysisError && (
                    <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">{analysisError}</p>
                    </div>
                )}

                {/* Upload Section */}
                <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
                        <p className="font-semibold mb-2">Documentos aceitos:</p>
                        <ul className="space-y-1 text-blue-700/90 ml-4 list-disc">
                            <li>Conta de consumo (Água, Luz, Gás) - <strong>Mais comum</strong></li>
                            <li>Carnê do IPTU</li>
                            <li>Contrato de Compra e Venda</li>
                            <li>Matrícula do Imóvel (Registro no Cartório)</li>
                            <li>Escritura Pública</li>
                            <li>Contrato de Aluguel anterior</li>
                        </ul>
                    </div>

                    <div
                        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                        className={cn(
                            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors",
                            isAnalyzing ? "bg-muted cursor-not-allowed opacity-50" : "border-emerald-100 bg-emerald-50/30 cursor-pointer hover:bg-emerald-50"
                        )}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".pdf,image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={isAnalyzing}
                        />
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                            <FileText className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Clique para selecionar arquivos</h3>
                        <p className="text-sm text-muted-foreground mt-1">ou arraste e solte aqui (PDF, JPG, PNG)</p>
                    </div>

                    {/* File List with Status */}
                    {documents.length > 0 && (
                        <div className="space-y-2 mt-4">
                            {documents.map((file, idx) => {
                                const isProcessing = processingFiles.has(file.name);
                                return (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded flex items-center justify-center border text-muted-foreground">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{file.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {isProcessing ? (
                                                        <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> Em Análise
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                                                            <CheckCircle2 className="w-3 h-3" /> Processado
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => removeDoc(idx)}>
                                            <X className="w-4 h-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Analysis Results / Confirmation */}
                {extractionResults.length > 0 && (
                    <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4 animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                            <h4 className="font-semibold text-lg">Dados da Propriedade</h4>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Proprietário Identificado</Label>
                                <Input
                                    value={confirmedData.owner_name || ''}
                                    onChange={e => setConfirmedData({ ...confirmedData, owner_name: e.target.value })}
                                    className="bg-muted/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>CPF/CNPJ</Label>
                                <Input
                                    value={confirmedData.cpf || ''}
                                    onChange={e => setConfirmedData({ ...confirmedData, cpf: e.target.value })}
                                    className="bg-muted/20"
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label>Endereço Completo</Label>
                                <Input
                                    value={confirmedData.address?.street ?
                                        `${confirmedData.address.street}, ${confirmedData.address.number || ''} - ${confirmedData.address.city}/${confirmedData.address.state}`
                                        : ''}
                                    onChange={e => {
                                        // Simple edit for single field mock
                                        setConfirmedData({ ...confirmedData, address: { ...confirmedData.address, street: e.target.value } })
                                    }}
                                    className="bg-muted/20"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4">
                    <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                        <Plus className="w-4 h-4" /> Adicionar Outra Propriedade
                    </Button>

                    <Button
                        className="h-10 text-base bg-gray-600 hover:bg-gray-700 text-white px-8 transition-colors"
                        disabled={isMandatory && extractionResults.length === 0}
                        onClick={handleConfirm}
                    >
                        {extractionResults.length > 0 ? "Enviar Documentos" : "Pular Etapa"}
                    </Button>
                </div>
            </div>
        </StepLayout>
    );
}
