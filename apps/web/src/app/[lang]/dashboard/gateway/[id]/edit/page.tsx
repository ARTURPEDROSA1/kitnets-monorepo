"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@kitnets/ui";
import {
    ArrowLeft, Save, Trash2, Camera, Router as RouterIcon,
    Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon, Gauge
} from "lucide-react";

interface GatewayData {
    id: string;
    label: string;
    serial_number: string;
    status: string;
    description: string;
    photo_url: string;
    panel_photo_url: string;
}

export default function EditGatewayPage() {
    const params = useParams();
    const lang = params.lang as string;
    const id = params.id as string;
    const router = useRouter();
    const supabase = createClient();

    const [gateway, setGateway] = useState<GatewayData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [removing, setRemoving] = useState(false);

    // Form state
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [panelPhotoPreview, setPanelPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [panelPhotoFile, setPanelPhotoFile] = useState<File | null>(null);

    const photoInputRef = useRef<HTMLInputElement>(null);
    const panelPhotoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchGateway();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const fetchGateway = async () => {
        setLoading(true);
        const { data, error: fetchErr } = await supabase
            .from("gateways")
            .select("id, label, serial_number, status, description, photo_url, panel_photo_url")
            .eq("id", id)
            .single();

        if (fetchErr || !data) {
            setError("Gateway não encontrado.");
            setLoading(false);
            return;
        }

        setGateway(data as GatewayData);
        setLabel(data.label || "");
        setDescription(data.description || "");
        if (data.photo_url) setPhotoPreview(data.photo_url);
        if (data.panel_photo_url) setPanelPhotoPreview(data.panel_photo_url);
        setLoading(false);
    };

    const uploadPhoto = async (file: File, path: string): Promise<string | null> => {
        const { data, error: uploadErr } = await supabase.storage
            .from("gateway-photos")
            .upload(path, file, { upsert: true });

        if (uploadErr) {
            console.error("Upload error:", uploadErr);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from("gateway-photos")
            .getPublicUrl(data.path);

        return urlData.publicUrl;
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, type: "gateway" | "panel") => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            if (type === "gateway") {
                setPhotoPreview(reader.result as string);
                setPhotoFile(file);
            } else {
                setPanelPhotoPreview(reader.result as string);
                setPanelPhotoFile(file);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!gateway) return;
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const updates: Record<string, unknown> = {
                label: label.trim() || gateway.label,
                description: description.trim() || null,
            };

            // Upload photos if changed
            if (photoFile) {
                const url = await uploadPhoto(photoFile, `${id}/gateway-photo.${photoFile.name.split('.').pop()}`);
                if (url) updates.photo_url = url;
            }

            if (panelPhotoFile) {
                const url = await uploadPhoto(panelPhotoFile, `${id}/panel-photo.${panelPhotoFile.name.split('.').pop()}`);
                if (url) updates.panel_photo_url = url;
            }

            const { error: updateErr } = await supabase
                .from("gateways")
                .update(updates)
                .eq("id", id);

            if (updateErr) {
                setError("Erro ao salvar: " + updateErr.message);
            } else {
                setSaved(true);
                setPhotoFile(null);
                setPanelPhotoFile(null);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            setError("Erro inesperado ao salvar.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!gateway) return;
        setRemoving(true);
        setError(null);

        try {
            // Unclaim the gateway — set owner_id and property_id to null, status to unclaimed
            const { error: removeErr } = await supabase
                .from("gateways")
                .update({
                    owner_id: null,
                    property_id: null,
                    status: "unclaimed",
                    description: null,
                    photo_url: null,
                    panel_photo_url: null,
                })
                .eq("id", id);

            if (removeErr) {
                setError("Erro ao remover: " + removeErr.message);
                setRemoving(false);
                return;
            }

            // Redirect to dashboard
            router.push(`/${lang}/dashboard`);
        } catch (err) {
            setError("Erro inesperado.");
            console.error(err);
            setRemoving(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!gateway) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
                <p className="text-muted-foreground">Gateway não encontrado.</p>
                <Link href={`/${lang}/dashboard`} className="text-primary mt-4 inline-block">
                    Voltar para Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back Link */}
            <Link
                href={`/${lang}/dashboard/gateway/${id}`}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para Gateway
            </Link>

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                        <RouterIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Editar Gateway</h1>
                        <p className="text-sm text-muted-foreground font-mono">{gateway.serial_number}</p>
                    </div>
                </div>
            </div>

            {/* ── Main Form ─────────────────────────────── */}
            <div className="space-y-6">

                {/* Gateway Name */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <RouterIcon className="w-4 h-4 text-primary" />
                        Informações do Gateway
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Nome do Gateway
                            </label>
                            <input
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="ex: iSMA-B8I-IP"
                                className="w-full px-4 py-2.5 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Descrição
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="ex: Gateway instalado no quadro de medidores, alimentação 24V, interligado ao PLC via Modbus TCP..."
                                rows={3}
                                className="w-full px-4 py-2.5 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                            />
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground">Status:</span>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${gateway.status === "online"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                }`}>
                                {gateway.status?.toUpperCase() || "OFFLINE"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Photos Section */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Camera className="w-4 h-4 text-primary" />
                        Fotos do Equipamento
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Gateway Photo */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Foto do Gateway
                            </label>
                            <div
                                onClick={() => photoInputRef.current?.click()}
                                className="relative w-full aspect-[4/3] rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all overflow-hidden group"
                            >
                                {photoPreview ? (
                                    <>
                                        <img
                                            src={photoPreview}
                                            alt="Foto do Gateway"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Camera className="w-8 h-8 text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                        <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                                        <span className="text-sm">Clique para adicionar foto</span>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoChange(e, "gateway")}
                            />
                        </div>

                        {/* Panel Photo */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Foto do Painel / Hidrômetros
                            </label>
                            <div
                                onClick={() => panelPhotoInputRef.current?.click()}
                                className="relative w-full aspect-[4/3] rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all overflow-hidden group"
                            >
                                {panelPhotoPreview ? (
                                    <>
                                        <img
                                            src={panelPhotoPreview}
                                            alt="Foto do Painel"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Camera className="w-8 h-8 text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                        <Gauge className="w-10 h-10 mb-2 opacity-50" />
                                        <span className="text-sm">Clique para adicionar foto</span>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={panelPhotoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoChange(e, "panel")}
                            />
                        </div>
                    </div>
                </div>

                {/* Error/Success Messages */}
                {error && (
                    <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                {saved && (
                    <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl text-sm">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        <span>Alterações salvas com sucesso!</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row justify-between gap-4 pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 h-auto font-semibold"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Salvar Alterações
                            </>
                        )}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setShowRemoveConfirm(true)}
                        className="px-6 py-2.5 h-auto font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remover Gateway
                    </Button>
                </div>
            </div>

            {/* ── Remove Confirmation Modal ──────────────── */}
            {showRemoveConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRemoveConfirm(false)} />
                    <div className="relative bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">Remover Gateway</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Tem certeza que deseja remover o gateway <strong>{gateway.label}</strong> ({gateway.serial_number})?
                            O gateway ficará disponível para ser adicionado novamente por qualquer usuário.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            <strong>Nota:</strong> Os dados de leituras históricas serão preservados.
                        </p>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowRemoveConfirm(false)}
                                disabled={removing}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleRemove}
                                disabled={removing}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {removing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Removendo...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Confirmar Remoção
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
