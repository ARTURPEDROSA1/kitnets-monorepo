"use client";

import React, { useState, useMemo, useRef } from 'react';
import { Button } from '@kitnets/ui';
import {
    Folder,
    FolderOpen,
    ArrowLeft,
    Receipt,
    FileSignature,
    ClipboardCheck,
    FileSpreadsheet,
    Scroll,
    ShieldCheck,
    FolderPlus,
    Eye,
    FileText,
    CheckCircle2,
    UploadCloud,
    Trash2,
    ChevronDown,
    ChevronUp,
    Edit3,
    ArrowRight,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfViewerModal } from '@/components/ui/PdfViewerModal';
import type { ProofData } from '@/app/[lang]/profile/ProfileContent';

export type DocCategory =
    | 'iptu'
    | 'contrato_aluguel'
    | 'vistoria'
    | 'compra_venda'
    | 'matricula'
    | 'escritura'
    | 'certidoes'
    | 'outros';

export interface CategoryDef {
    id: DocCategory;
    label: string;
    singular: string;
    description: string;
    icon: React.ElementType;
}

export const DOCUMENT_CATEGORIES: CategoryDef[] = [
    {
        id: 'iptu',
        label: 'IPTU',
        singular: 'IPTU',
        description: 'Imposto Predial e Territorial Urbano (exercício anual)',
        icon: Receipt,
    },
    {
        id: 'contrato_aluguel',
        label: 'Contratos',
        singular: 'Contrato',
        description: 'Contratos de locação, aditivos e termos de rescisão',
        icon: FileSignature,
    },
    {
        id: 'vistoria',
        label: 'Vistoria',
        singular: 'Vistoria',
        description: 'Laudos de vistoria de entrada e saída com fotos e assinaturas',
        icon: ClipboardCheck,
    },
    {
        id: 'compra_venda',
        label: 'Compra e Venda',
        singular: 'Contrato de Compra e Venda',
        description: 'Contrato de compra e venda ou compromisso / promessa',
        icon: FileText,
    },
    {
        id: 'matricula',
        label: 'Matrícula',
        singular: 'Matrícula',
        description: 'Certidão de matrícula atualizada expedida pelo Cartório de Registro de Imóveis',
        icon: FileSpreadsheet,
    },
    {
        id: 'escritura',
        label: 'Escritura',
        singular: 'Escritura',
        description: 'Escritura pública de compra e venda lavrada em Tabelionato de Notas',
        icon: Scroll,
    },
    {
        id: 'certidoes',
        label: 'Certidões',
        singular: 'Certidão',
        description: 'Certidões de regularidade fiscal, débitos municipais, estaduais e forenses',
        icon: ShieldCheck,
    },
    {
        id: 'outros',
        label: 'Outros',
        singular: 'Outro Documento',
        description: 'Plantas baixas e demais arquivos',
        icon: FolderPlus,
    },
];

/**
 * Deduce document category from explicit tag or filename regex.
 */
export const getProofCategory = (name: string, explicitType?: string): DocCategory => {
    if (explicitType && DOCUMENT_CATEGORIES.some(c => c.id === explicitType)) {
        return explicitType as DocCategory;
    }
    const n = (name || '').toLowerCase();
    if (n.includes('[iptu') || /iptu|imposto\s*predial|carn[eê]\s*predial/i.test(n)) return 'iptu';
    if (n.includes('[contrato_aluguel') || n.includes('[aluguel') || /loca[çc][aã]o|aluguel|inquilino|arrenda|rescis[aã]o/i.test(n)) return 'contrato_aluguel';
    if (n.includes('[vistoria') || /vistoria|laudo|inspe[çc][aã]o/i.test(n)) return 'vistoria';
    if (n.includes('[compra_venda') || /compra.*venda|compromisso.*compra|promessa.*compra|cess[aã]o/i.test(n)) return 'compra_venda';
    if (n.includes('[matricula') || /matr[ií]cula|registro\s*de\s*im[oó]veis|\brgi\b/i.test(n)) return 'matricula';
    if (n.includes('[escritura') || /escritura|tabeli[aã]o/i.test(n)) return 'escritura';
    if (n.includes('[certid') || /certid[aã]o|cnd|negativa|tribut[aá]ria|forense/i.test(n)) return 'certidoes';
    return 'outros';
};

/**
 * Deduce year from tag, filename, or creation timestamp.
 */
export const getProofYear = (name: string, createdAt?: string, explicitYear?: number | string): number => {
    if (explicitYear) {
        const num = typeof explicitYear === 'string' ? parseInt(explicitYear, 10) : explicitYear;
        if (!isNaN(num) && num > 1900 && num < 2100) return num;
    }
    // 1. Tag like [IPTU 2026] or [2025]
    const tagMatch = (name || '').match(/\[.*?(19\d{2}|20\d{2}).*?\]/);
    if (tagMatch && tagMatch[1]) return parseInt(tagMatch[1], 10);

    // 2. 4 digits in filename
    const yearMatch = (name || '').match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch && yearMatch[1]) return parseInt(yearMatch[1], 10);

    // 3. createdAt timestamp
    if (createdAt) {
        const d = new Date(createdAt);
        if (!isNaN(d.getTime())) return d.getFullYear();
    }

    return new Date().getFullYear();
};

/**
 * Strips bracketed category/year prefix for display.
 */
export const formatDocumentDisplayName = (originalName: string): string => {
    if (!originalName) return 'Documento sem nome';
    return originalName.replace(/^\[.*?\]\s*/, '').trim() || originalName;
};

export const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
};

export interface UnifiedDocItem {
    id: string;
    originalName: string;
    displayName: string;
    category: DocCategory;
    year: number;
    size?: number;
    createdAt: string;
    status: 'saved' | 'analyzing' | 'success' | 'error' | 'pending';
    fileUrl?: string;
    rawFile?: File;
    isSaved: boolean;
    savedProofId?: string;
    pendingIndex?: number;
}

export interface PropertyDocumentsCardProps {
    propIdx: number;
    savedProofs: ProofData[];
    ownershipFiles: File[];
    fileAnalysisStatus: Record<string, string>;
    profileId: string | null;
    isDocVerified: boolean;
    extractedAddressInfo: string | null;
    isOwnershipOpen: boolean;
    isAddressCardVisible: boolean;
    isAddressFilled?: boolean;
    isPropertySaved?: boolean;
    isSaving: boolean;
    onToggleOpen: () => void;
    onUploadFiles: (files: File[], category?: DocCategory, year?: number) => Promise<void>;
    onRemoveSavedProof: (proofId: string) => Promise<void>;
    onRemovePendingFile: (index: number) => void;
    onManualAddress: () => void;
    onConfirm: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSupabase: () => Promise<any>;
}

export const PropertyDocumentsCard: React.FC<PropertyDocumentsCardProps> = ({
    propIdx,
    savedProofs,
    ownershipFiles,
    fileAnalysisStatus,
    profileId,
    isDocVerified,
    extractedAddressInfo,
    isOwnershipOpen,
    isAddressFilled,
    isPropertySaved = false,
    isSaving,
    onToggleOpen,
    onUploadFiles,
    onRemoveSavedProof,
    onRemovePendingFile,
    onManualAddress,
    onConfirm,
    getSupabase,
}) => {
    // Current year for defaults
    const currentCalendarYear = useMemo(() => new Date().getFullYear(), []);

    // Build unified documents list
    const unifiedDocs = useMemo<UnifiedDocItem[]>(() => {
        const items: UnifiedDocItem[] = [];

        // 1. Saved proofs
        for (const sp of savedProofs) {
            if (!sp) continue;
            const category = getProofCategory(sp.original_name, sp.document_type);
            const year = getProofYear(sp.original_name, sp.created_at, sp.year);
            items.push({
                id: `saved-${sp.id}`,
                originalName: sp.original_name,
                displayName: formatDocumentDisplayName(sp.original_name),
                category,
                year,
                size: sp.file_size,
                createdAt: sp.created_at,
                status: 'saved',
                fileUrl: sp.file_url,
                isSaved: true,
                savedProofId: sp.id,
            });
        }

        // 2. Pending files (in ownershipFiles)
        ownershipFiles.forEach((file, index) => {
            const category = getProofCategory(file.name);
            const year = getProofYear(file.name);
            const analysis = fileAnalysisStatus[file.name];
            let status: UnifiedDocItem['status'] = 'pending';
            if (analysis === 'analyzing') status = 'analyzing';
            else if (analysis === 'success') status = 'success';
            else if (analysis === 'error') status = 'error';

            items.push({
                id: `pending-${file.name}-${index}`,
                originalName: file.name,
                displayName: formatDocumentDisplayName(file.name),
                category,
                year,
                size: file.size,
                createdAt: new Date(file.lastModified || Date.now()).toISOString(),
                status,
                rawFile: file,
                isSaved: false,
                pendingIndex: index,
            });
        });

        return items;
    }, [savedProofs, ownershipFiles, fileAnalysisStatus]);

    // Active folder state: null = root view (all folders grid), string = opened folder
    const [openFolder, setOpenFolder] = useState<DocCategory | null>(null);

    // In-App document viewer state
    const [viewingDoc, setViewingDoc] = useState<{ url: string; title: string; fileName: string } | null>(null);

    // Upload state inside component
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const folderFileInputRef = useRef<HTMLInputElement>(null);

    // Total documents count
    const totalDocsCount = unifiedDocs.length;

    // Open/view document inside Kitnets
    const handleViewDocument = async (doc: UnifiedDocItem) => {
        let targetUrl: string | null = null;

        if (doc.rawFile) {
            targetUrl = URL.createObjectURL(doc.rawFile);
        } else if (!doc.fileUrl) {
            alert('Arquivo indisponível para visualização.');
            return;
        } else if (doc.fileUrl.startsWith('http://') || doc.fileUrl.startsWith('https://')) {
            targetUrl = doc.fileUrl;
        } else {
            try {
                const sb = await getSupabase();
                const { data, error } = await sb.storage.from('documents').createSignedUrl(doc.fileUrl, 3600);
                if (data?.signedUrl) {
                    targetUrl = data.signedUrl;
                } else if (!error) {
                    const { data: pub } = sb.storage.from('documents').getPublicUrl(doc.fileUrl);
                    if (pub?.publicUrl) targetUrl = pub.publicUrl;
                } else {
                    console.error('Signed URL error:', error);
                    alert('Não foi possível gerar link para visualizar o arquivo.');
                    return;
                }
            } catch (err) {
                console.error('Error opening doc:', err);
                alert('Erro ao abrir documento.');
                return;
            }
        }

        if (targetUrl) {
            setViewingDoc({
                url: targetUrl,
                title: doc.displayName || 'Documento do Imóvel',
                fileName: doc.displayName
                    ? (doc.displayName.toLowerCase().endsWith('.pdf') ? doc.displayName : `${doc.displayName}.pdf`)
                    : 'documento.pdf',
            });
        }
    };

    // Delete document
    const handleDeleteDocument = async (doc: UnifiedDocItem) => {
        if (!confirm(`Deseja remover "${doc.displayName}"?`)) return;
        if (doc.isSaved && doc.savedProofId) {
            await onRemoveSavedProof(doc.savedProofId);
        } else if (typeof doc.pendingIndex === 'number') {
            onRemovePendingFile(doc.pendingIndex);
        }
    };

    // Upload files
    const handleFilesSelected = async (
        fileList: FileList | File[] | null,
        targetCategory?: DocCategory,
        targetYear?: number
    ) => {
        if (!fileList || fileList.length === 0) return;
        const filesArray = Array.from(fileList);
        setIsUploading(true);
        try {
            const effectiveCategory = targetCategory;
            const effectiveYear = targetYear ?? currentCalendarYear;
            await onUploadFiles(filesArray, effectiveCategory, effectiveYear);

            // Only navigate into the target folder if property is already saved
            if (isPropertySaved) {
                if (effectiveCategory) {
                    setOpenFolder(effectiveCategory);
                } else if (filesArray.length > 0) {
                    const detected = getProofCategory(filesArray[0].name);
                    setOpenFolder(detected);
                }
            }
        } catch (err) {
            console.error('Error in handleFilesSelected:', err);
        } finally {
            setIsUploading(false);
            if (folderFileInputRef.current) folderFileInputRef.current.value = '';
        }
    };

    // Filter documents for any specific category
    const getDocsForCategory = (catId: DocCategory) => {
        const list = unifiedDocs.filter(d => d.category === catId);
        list.sort((a, b) => {
            if (catId === 'iptu' && b.year !== a.year) {
                return b.year - a.year;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return list;
    };

    return (
        <div id={`prop-${propIdx}-ownership`} className="bg-card border border-border p-5 sm:p-6 rounded-xl shadow-sm space-y-4">
            {/* Header Accordion Toggle */}
            <button
                type="button"
                onClick={onToggleOpen}
                className="flex items-center justify-between w-full text-left"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={cn(
                            "p-2.5 rounded-lg flex-shrink-0 transition-colors",
                            isDocVerified || extractedAddressInfo?.startsWith('✅')
                                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                                : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                        )}
                    >
                        {isDocVerified || extractedAddressInfo?.startsWith('✅') ? (
                            <CheckCircle2 className="w-5 h-5" />
                        ) : (
                            <FileText className="w-5 h-5" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
                                Documentos da Propriedade
                            </h3>
                            {totalDocsCount > 0 && (
                                <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full font-medium">
                                    {totalDocsCount} {totalDocsCount === 1 ? 'documento' : 'documentos'}
                                </span>
                            )}
                            {(isDocVerified || extractedAddressInfo?.startsWith('✅')) && (
                                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                                    Verificado ✓
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {isPropertySaved
                                ? "Pastas organizadas para IPTU, contratos de aluguel, vistorias, escrituras e certidões."
                                : "Envie IPTU, matrícula ou escritura para preencher o endereço automaticamente."}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {isOwnershipOpen ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                </div>
            </button>

            {/* Accordion Body */}
            {isOwnershipOpen && (
                <div className="pt-2 space-y-5">
                    {/* Case 1: Initial empty/adding state during property creation (unsaved property) */}
                    {!isPropertySaved ? (
                        <div className="space-y-4">
                            <div className="bg-muted/30 p-4 rounded-xl border border-border text-sm text-muted-foreground">
                                <p className="font-semibold text-foreground mb-1">
                                    Envie um documento para preencher o endereço automaticamente:
                                </p>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Nossa IA extrai o endereço e dados fiscais na hora para agilizar seu cadastro.
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                        <Receipt className="w-3.5 h-3.5 text-blue-600" /> IPTU
                                    </span>
                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" /> Matrícula do Imóvel
                                    </span>
                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                        <Scroll className="w-3.5 h-3.5 text-blue-600" /> Escritura Pública
                                    </span>
                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                        <FileText className="w-3.5 h-3.5 text-blue-600" /> Compra e Venda
                                    </span>
                                </div>
                            </div>

                            {/* If user has uploaded any documents while adding, list them cleanly */}
                            {unifiedDocs.length > 0 && (
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Documentos enviados ({unifiedDocs.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {unifiedDocs.map((doc) => {
                                            const catDef = DOCUMENT_CATEGORIES.find(c => c.id === doc.category);
                                            const CatIcon = catDef?.icon || FileText;
                                            return (
                                                <div
                                                    key={doc.id}
                                                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center flex-shrink-0">
                                                            <CatIcon className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                                                                    {doc.displayName}
                                                                </p>
                                                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                                                    {catDef?.label || 'Documento'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                                {doc.size && <span>{formatFileSize(doc.size)}</span>}
                                                                {doc.status === 'analyzing' && (
                                                                    <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                                                                        <Loader2 className="w-3 h-3 animate-spin" /> Analisando com IA...
                                                                    </span>
                                                                )}
                                                                {doc.status === 'success' && (
                                                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                                                        <CheckCircle2 className="w-3 h-3" /> Endereço extraído
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                                                            onClick={() => handleViewDocument(doc)}
                                                        >
                                                            <Eye className="w-3.5 h-3.5 mr-1" />
                                                            Visualizar
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => handleDeleteDocument(doc)}
                                                            title="Remover documento"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className={cn(
                                "border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center hover:bg-muted/40 transition-colors relative cursor-pointer group",
                                unifiedDocs.length > 0 ? "p-5" : "p-8"
                            )}>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => handleFilesSelected(e.target.files)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isUploading}
                                />
                                <div className={cn(
                                    "rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform",
                                    unifiedDocs.length > 0 ? "w-10 h-10 mb-2" : "w-12 h-12 mb-3"
                                )}>
                                    {isUploading ? (
                                        <Loader2 className={cn(unifiedDocs.length > 0 ? "w-5 h-5" : "w-6 h-6", "animate-spin")} />
                                    ) : (
                                        <UploadCloud className={unifiedDocs.length > 0 ? "w-5 h-5" : "w-6 h-6"} />
                                    )}
                                </div>
                                <p className="font-semibold text-foreground text-center text-sm">
                                    {unifiedDocs.length > 0
                                        ? "Adicionar outro documento ou arraste aqui"
                                        : "Arraste seus documentos aqui ou clique para selecionar"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 text-center">
                                    Formatos aceitos: PDF, JPG, PNG (máx. 15MB por arquivo)
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* Case 2: FOLDER VIEW */
                        <div className="space-y-4">
                            {/* VIEW A: ROOT VIEW - 8 Folders Grid */}
                            {openFolder === null && (
                                <div className="space-y-5 animate-in fade-in-50 duration-200">
                                    {/* 8 Folders Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                        {DOCUMENT_CATEGORIES.map((cat) => {
                                            const CatIcon = cat.icon;
                                            const docs = getDocsForCategory(cat.id);
                                            const count = docs.length;

                                            return (
                                                <div
                                                    key={cat.id}
                                                    onClick={() => setOpenFolder(cat.id)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') setOpenFolder(cat.id); }}
                                                    className={cn(
                                                        "group relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left select-none",
                                                        count > 0
                                                            ? "bg-card border-border hover:border-primary/60 hover:shadow-md hover:-translate-y-0.5"
                                                            : "bg-muted/10 border-border/70 hover:border-border hover:bg-muted/30"
                                                    )}
                                                >
                                                    {/* Top row: Folder Icon + Count Badge */}
                                                    <div className="flex items-center justify-between gap-2 mb-3">
                                                        <div
                                                            className={cn(
                                                                "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105",
                                                                count > 0
                                                                    ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shadow-2xs"
                                                                    : "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {count > 0 ? (
                                                                <FolderOpen className="w-5 h-5 fill-amber-500/20" />
                                                            ) : (
                                                                <Folder className="w-5 h-5" />
                                                            )}
                                                        </div>

                                                        {count > 0 ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                                                                {count} {count === 1 ? 'arquivo' : 'arquivos'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-muted-foreground font-medium">
                                                                Vazia
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Folder Title */}
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                                                            <CatIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                                                            <span className="truncate">{cat.label}</span>
                                                        </h4>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* VIEW B: INSIDE A SPECIFIC FOLDER */}
                            {openFolder !== null && (() => {
                                const currentCatDef = DOCUMENT_CATEGORIES.find(c => c.id === openFolder)!;
                                const CatIcon = currentCatDef.icon;
                                const categoryDocs = getDocsForCategory(currentCatDef.id);

                                return (
                                    <div className="space-y-5 animate-in fade-in-50 duration-200">
                                        {/* Breadcrumb navigation bar */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setOpenFolder(null)}
                                                    className="gap-1.5 text-xs font-semibold h-8 hover:bg-muted"
                                                >
                                                    <ArrowLeft className="w-3.5 h-3.5" />
                                                    <span>Todas as Pastas</span>
                                                </Button>
                                                <span className="text-muted-foreground text-sm">/</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                                        <FolderOpen className="w-4 h-4 fill-amber-500/20" />
                                                    </div>
                                                    <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                                        <CatIcon className="w-4 h-4 text-muted-foreground" />
                                                        <span>{currentCatDef.label}</span>
                                                    </h4>
                                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                                                        {categoryDocs.length} {categoryDocs.length === 1 ? 'arquivo' : 'arquivos'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-xs text-muted-foreground">
                                                {currentCatDef.description}
                                            </div>
                                        </div>

                                        {/* FOLDER CONTENTS: ALL CATEGORIES */}
                                        <div className="space-y-4">
                                            {/* Documents List */}
                                            {categoryDocs.length > 0 ? (
                                                <div className="space-y-2">
                                                    {categoryDocs.map((doc) => (
                                                        <div
                                                            key={doc.id}
                                                            className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors gap-3"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                                                                    <CatIcon className="w-4 h-4" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                                        {doc.displayName}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {formatFileSize(doc.size)} {doc.size ? '•' : ''} Enviado em {new Date(doc.createdAt).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleViewDocument(doc)}
                                                                    className="h-8 gap-1.5 text-xs"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    <span>Visualizar</span>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleDeleteDocument(doc)}
                                                                    className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-2">
                                                    <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center text-muted-foreground">
                                                        <Folder className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-sm font-medium text-foreground">
                                                        Esta pasta está vazia
                                                    </p>
                                                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                                        Envie o primeiro documento para começar a organizar os arquivos de {currentCatDef.label.toLowerCase()} desta propriedade.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Direct Quick Upload for this Folder */}
                                            <div className="border border-border bg-muted/10 rounded-xl p-4 sm:p-5 space-y-2">
                                                <div className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center hover:bg-muted/40 transition-colors relative cursor-pointer group">
                                                    <input
                                                        ref={folderFileInputRef}
                                                        type="file"
                                                        multiple
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFilesSelected(e.target.files, currentCatDef.id)}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        disabled={isUploading}
                                                    />
                                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                                                        {isUploading ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <UploadCloud className="w-5 h-5" />
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-semibold text-foreground text-center">
                                                        Adicionar {currentCatDef.singular} nesta pasta
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 text-center">
                                                        Arraste ou clique para enviar arquivos (.pdf, .jpg, .png)
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Actions in bottom right corner: Digitar manualmente & Confirmar */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                        {!isAddressFilled && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                onClick={onManualAddress}
                            >
                                <Edit3 className="w-4 h-4" /> Digitar manualmente
                            </Button>
                        )}
                        {totalDocsCount > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isSaving}
                                className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                onClick={onConfirm}
                            >
                                Confirmar <ArrowRight className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* In-App Document Viewer */}
            {viewingDoc && (
                <PdfViewerModal
                    isOpen={!!viewingDoc}
                    onClose={() => setViewingDoc(null)}
                    url={viewingDoc.url}
                    title={viewingDoc.title}
                    fileName={viewingDoc.fileName}
                />
            )}
        </div>
    );
};

export default PropertyDocumentsCard;
