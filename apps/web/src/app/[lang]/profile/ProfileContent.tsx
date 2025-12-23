"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { CheckCircle2, AlertTriangle, FileText, Loader2, Trash2, MapPin, Camera, Sparkles, Save, UploadCloud, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser, useAuth } from '@clerk/nextjs';
import { createBrowserClient } from '@supabase/ssr';
import { deleteAccount } from './actions';
import { Dictionary } from '@/dictionaries';

// Types
type ProofData = {
    id: string;
    original_name: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
};

interface ProfileContentProps {
    dict: Dictionary;
}

// Helper component for photo preview
const PhotoPreview = ({ file, onRemove }: { file: File, onRemove: () => void }) => {
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    if (!preview) return <div className="aspect-square bg-muted rounded-lg animate-pulse" />;

    return (
        <div className="aspect-square rounded-lg border border-border relative group overflow-hidden bg-muted">
            <Image src={preview} alt="New Upload" width={200} height={200} className="w-full h-full object-cover" />
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={onRemove}>
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 truncate text-center">
                {file.name}
            </div>
        </div>
    );
};

export default function ProfileContent({ dict }: ProfileContentProps) {
    const { isLoaded, user } = useUser();
    const p = dict.profile;
    const { getToken } = useAuth();

    // Tabs
    const tabs = [
        { id: 'ownership', label: p.tabs.ownership },
        { id: 'basics', label: p.tabs.basics },
        { id: 'security', label: p.tabs.security },
    ];
    const [activeTab, setActiveTab] = useState<'basics' | 'ownership' | 'security'>('ownership');

    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingAddress, setIsLoadingAddress] = useState(false);
    const [cepError, setCepError] = useState("");
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Success State
    const [showSuccess, setShowSuccess] = useState(false);

    // Data state
    const [ownershipFiles, setOwnershipFiles] = useState<File[]>([]); // New files to upload
    const [propertyPhotos, setPropertyPhotos] = useState<File[]>([]); // New photos
    const [savedProofs, setSavedProofs] = useState<ProofData[]>([]); // Saved in DB
    const [savedPhotos, setSavedPhotos] = useState<string[]>([]); // Saved URLs
    const [profileId, setProfileId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        cpf: '',
        birthDate: '',
        ownerAddress: {
            cep: '',
            street: '',
            number: '',
            city: '',
            state: '',
            neighborhood: '',
            complement: ''
        },
        propertyAddress: {
            cep: '',
            street: '',
            number: '',
            city: '',
            state: '',
            neighborhood: '',
            complement: '',
            description: ''
        }
    });

    const getSupabase = useCallback(async () => {
        const token = await getToken({ template: 'supabase' });
        return createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                global: { headers: { Authorization: `Bearer ${token || ''}` } }
            }
        );
    }, [getToken]);

    // Load initial data
    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;
            try {
                const sb = await getSupabase();
                const { data: profile } = await sb
                    .from('profiles')
                    .select('*')
                    .eq('clerk_id', user.id)
                    .single();

                if (profile) {
                    setProfileId(profile.id);
                    setFormData({
                        name: profile.full_name || user.fullName || '',
                        phone: profile.phone || user.phoneNumbers[0]?.phoneNumber || '',
                        cpf: profile.cpf || '',
                        birthDate: profile.birth_date || '',
                        ownerAddress: profile.address || {
                            cep: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: ''
                        },
                        propertyAddress: profile.property_address || {
                            cep: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '', description: ''
                        }
                    });

                    // Load photos
                    if (profile.property_photos && Array.isArray(profile.property_photos)) {
                        setSavedPhotos(profile.property_photos);
                    }

                    // Load proofs
                    const { data: proofs } = await sb
                        .from('ownership_proofs')
                        .select('*')
                        .eq('profile_id', profile.id)
                        .order('created_at', { ascending: false });

                    if (proofs) setSavedProofs(proofs as ProofData[]);
                } else {
                    // Default for new users
                    setFormData(prev => ({
                        ...prev,
                        name: user.fullName || '',
                        phone: user.phoneNumbers[0]?.phoneNumber || '',
                    }));
                }
            } catch (err) {
                console.error("Error loading profile:", err);
            }
        };

        if (user) loadProfile();
    }, [user, getSupabase]);


    // Masks
    const formatPhone = (value: string) => {
        return value
            .replace(/\D/g, "")
            .replace(/^(\d{2})(\d)/, "($1) $2")
            .replace(/(\d{5})(\d)/, "$1-$2")
            .substr(0, 15);
    };

    const formatCPF = (value: string) => {
        return value
            .replace(/\D/g, "")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})/, "$1-$2")
            .replace(/(-\d{2})\d+?$/, "$1");
    };

    const formatCEP = (value: string) => {
        return value
            .replace(/\D/g, "")
            .replace(/^(\d{5})(\d)/, "$1-$2")
            .substr(0, 9);
    };

    const [isLoadingEnrichment, setIsLoadingEnrichment] = useState(false);

    const handleInputChange = async (field: string, value: string) => {
        let formattedValue = value;
        if (field === 'phone') formattedValue = formatPhone(value);

        if (field === 'cpf') {
            formattedValue = formatCPF(value);
            const plainCpf = formattedValue.replace(/\D/g, '');

            // Trigger enrichment when CPF is complete
            if (plainCpf.length === 11 && plainCpf !== formData.cpf.replace(/\D/g, '')) {
                fetchCpfData(plainCpf);
            }
        }

        setFormData(prev => ({ ...prev, [field]: formattedValue }));
    };

    const fetchCpfData = async (cpf: string) => {
        setIsLoadingEnrichment(true);
        try {
            const res = await fetch(`/api/enrichment/cpf?cpf=${cpf}`);
            if (!res.ok) {
                console.warn(`Enrichment failed: ${res.status} ${res.statusText}`);
                return;
            }

            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.warn("Invalid JSON from enrichment API", text);
                return;
            }

            if (data.success && data.data) {
                setFormData(prev => ({
                    ...prev,
                    birthDate: prev.birthDate || data.data.birthDate,
                    phone: prev.phone || data.data.phone
                }));
                // Optional: Toast or visual indicator
            }
        } catch (error) {
            console.error("Enrichment failed", error);
        } finally {
            setIsLoadingEnrichment(false);
        }
    };

    const handleAddressChange = (type: 'ownerAddress' | 'propertyAddress', field: string, value: string) => {
        let formattedValue = value;
        if (field === 'cep') {
            formattedValue = formatCEP(value);
            if (formattedValue.length === 9) fetchAddress(type, formattedValue);
        }

        setFormData(prev => ({
            ...prev,
            [type]: { ...prev[type], [field]: formattedValue }
        }));
    };

    const fetchAddress = async (type: 'ownerAddress' | 'propertyAddress', cep: string) => {
        // Can make separate loading states if needed, but shared is okay for now
        setIsLoadingAddress(true);
        setCepError("");
        const cleanCep = cep.replace(/\D/g, "");

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                setCepError(p.basics.cepNotFound);
            } else {
                setFormData(prev => ({
                    ...prev,
                    [type]: {
                        ...prev[type],
                        street: data.logradouro,
                        neighborhood: data.bairro,
                        city: data.localidade,
                        state: data.uf
                    }
                }));
            }
        } catch (error) {
            setCepError(p.basics.cepError);
        } finally {
            setIsLoadingAddress(false);
        }
    };

    const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
    const [extractedAddressInfo, setExtractedAddressInfo] = useState<string | null>(null);
    const [fileAnalysisStatus, setFileAnalysisStatus] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>({});

    const removeFile = (index: number) => {
        setOwnershipFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setOwnershipFiles(prev => [...prev, ...newFiles]);

            // Trigger analysis for new files
            for (const file of newFiles) {
                analyzeDocument(file);
            }
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newPhotos = Array.from(e.target.files);
            setPropertyPhotos(prev => [...prev, ...newPhotos]);
        }
    };

    const removePhoto = (index: number) => {
        setPropertyPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const removeSavedPhoto = async (url: string) => {
        // Optimistic remove from UI, maybe delete from storage later or just update profile array
        setSavedPhotos(prev => prev.filter(u => u !== url));
        // We will update the DB on Save
    };

    const analyzeDocument = async (file: File) => {
        setAnalyzingFiles(prev => {
            const next = new Set(prev);
            next.add(file.name);
            return next;
        });

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/ownership/analyze', {
                method: 'POST',
                body: formData
            });
            // We don't really do anything with the result in manual mode anymore, 
            // except maybe clear the "analyzing" state.
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            setAnalyzingFiles(prev => {
                const next = new Set(prev);
                next.delete(file.name);
                return next;
            });
        }
    };

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && user) {
            try {
                await user.setProfileImage({ file: e.target.files[0] });
                alert(p.alerts.photoUpdated);
            } catch (err) {
                console.error("Erro ao atualizar foto", err);
                alert(p.alerts.photoError);
            }
        }
    };

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            const token = await getToken({ template: 'supabase' });
            if (!token) {
                alert(p.alerts.authError);
                setIsSaving(false);
                return;
            }

            const sb = await getSupabase();

            // 1. Upsert Profile

            const profilePayload = {
                clerk_id: user.id,
                full_name: formData.name,
                email: user.primaryEmailAddress?.emailAddress,
                phone: formData.phone,
                cpf: formData.cpf,
                birth_date: formData.birthDate || null,
                address: formData.ownerAddress, // Owner's Address
                property_address: formData.propertyAddress, // Property Address
                role: 'landlord'
            };

            // Only generate new ID if we don't have one loaded
            if (!profileId) {
                // @ts-expect-error ProfilePayload type mismatch
                profilePayload.id = crypto.randomUUID();
            }

            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .upsert(profilePayload, { onConflict: 'clerk_id' })
                .select()
                .single();

            if (profileError) {
                console.error("Supabase Profile Error:", profileError);
                throw new Error(`${p.alerts.saveError}: ${profileError.message} (${profileError.code})`);
            }

            // 2. Upload Files
            if (ownershipFiles.length > 0 && profile) {
                const sbUpload = await getSupabase();

                for (const file of ownershipFiles) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

                    const { error: uploadError } = await sbUpload.storage
                        .from('documents')
                        .upload(fileName, file);

                    if (uploadError) {
                        alert(`${p.alerts.uploadError} ${file.name}: ${uploadError.message}`);
                        continue;
                    }

                    const { error: proofError } = await sbUpload.from('ownership_proofs').insert({
                        profile_id: profile.id,
                        file_url: fileName,
                        original_name: file.name,
                        file_size: file.size,
                        mime_type: file.type,
                        status: 'pending'
                    });

                    if (proofError) console.error(proofError);
                }
                setOwnershipFiles([]);

                // Refresh
                const { data: proofs } = await sb
                    .from('ownership_proofs')
                    .select('*')
                    .eq('profile_id', profile.id)
                    .order('created_at', { ascending: false });
                if (proofs) setSavedProofs(proofs as ProofData[]);
            }

            // 3. Upload Photos
            const updatedPhotoUrls = [...savedPhotos];
            if (propertyPhotos.length > 0 && profile) {
                const sbUpload = await getSupabase();
                for (const file of propertyPhotos) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `photos/${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

                    const { error: uploadError, data: uploadData } = await sbUpload.storage
                        .from('documents') // Using documents bucket for simplified setup
                        .upload(fileName, file);

                    if (uploadError) {
                        console.error('Photo upload error:', uploadError);
                        continue;
                    }

                    // Get Public URL
                    const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                    updatedPhotoUrls.push(publicUrl);
                }
                setPropertyPhotos([]);
            }

            // Sync Photos Array to Profile
            if (profile) {
                await sb.from('profiles').update({
                    property_photos: updatedPhotoUrls,
                }).eq('id', profile.id);
                setSavedPhotos(updatedPhotoUrls);
            }

            // Update Clerk Name
            if (user && formData.name !== user.fullName) {
                await user.update({
                    firstName: formData.name.split(' ')[0],
                    lastName: formData.name.split(' ').slice(1).join(' ')
                });
            }

            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                if (activeTab === 'ownership') {
                    setActiveTab('basics');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 2000);

        } catch (err: unknown) {
            console.error('Error saving profile:', err);
            const errorMessage = (err as Error).message || String(err);
            alert(`${p.alerts.saveError}: ${errorMessage}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            await deleteAccount();
            window.location.href = '/';
        } catch (error) {
            console.error("Failed to delete", error);
            setIsDeleting(false);
            setShowDeleteModal(false);
            alert(p.alerts.deleteError);
        }
    };

    // Calculate progress
    const calculateProgress = () => {
        let completed = 0;
        const total = 8; // Name, Phone, CPF, BirthDate, Address (CEP+City+State), Email, Photo, Documents

        // Fields that count
        if (formData.name) completed++;
        if (formData.phone) completed++;
        if (formData.cpf) completed++;
        if (formData.birthDate) completed++;
        if (formData.ownerAddress.cep && formData.ownerAddress.city && formData.ownerAddress.state) completed++;
        if (formData.propertyAddress.cep && formData.propertyAddress.city && formData.propertyAddress.state) completed++;
        if (user?.primaryEmailAddress?.emailAddress) completed++;
        if (user?.imageUrl) completed++;
        if (savedProofs.length > 0) completed++;

        const isVerified = false; // Placeholder for Paid Verification status. Set to true when integrated.

        const rawPercentage = Math.round((completed / total) * 100);

        // If everything is filled but not verified, cap visual "green" completion or just generic %?
        // User said: "Green only after paid verification".
        // Use rawPercentage for width, but color depends on verified status.
        return { percentage: rawPercentage, isVerified };
    };

    const { percentage: progress, isVerified } = calculateProgress();

    // Dynamic Color for Progress Bar
    const getProgressColor = () => {
        if (isVerified) return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'; // Green & Glowing if verified
        if (progress < 30) return 'bg-red-500';
        if (progress < 70) return 'bg-orange-500';
        return 'bg-yellow-400'; // High progress but not verified
    };

    if (!isLoaded || !user) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

    const handleQuickPublish = (intent: 'rent' | 'sale') => {
        // Map profile data to ListingData structure
        const draftListing = {
            role: 'owner',
            intent: intent,
            propertyType: 'kitnet', // Defaulting to kitnet as it's the platform focus
            location: {
                city: formData.propertyAddress.city,
                state: formData.propertyAddress.state,
                neighborhood: formData.propertyAddress.neighborhood,
                street: formData.propertyAddress.street,
                number: formData.propertyAddress.number,
                complement: formData.propertyAddress.complement || '',
                address: `${formData.propertyAddress.street}, ${formData.propertyAddress.number} - ${formData.propertyAddress.neighborhood}, ${formData.propertyAddress.city} - ${formData.propertyAddress.state}`,
                zip: formData.propertyAddress.cep
            },
            details: {
                area: "", // Missing in profile
                bedrooms: 1, // Default
                bathrooms: 1, // Default
                parking: 0,
                furnished: false,
                pets: false,
                deliveryDate: "",
                units: "1",
                rentValue: "", // User needs to set this
                condoFee: "",
                tax: "",
                minPeriod: "12",
                salePrice: "",
                financing: false,
            },
            media: {
                photos: [...savedPhotos, ...propertyPhotos], // Combined strings and Files
                video: null,
                pdf: null
            },
            description: formData.propertyAddress.description || '',
            contact: {
                email: user?.primaryEmailAddress?.emailAddress || '',
                phone: formData.phone,
                whatsapp: true // Assume true for owner
            },
            identity: {
                cpf: formData.cpf,
                cnpj: '',
                creci: '',
                fullName: formData.name,
                businessName: '',
                tradeName: '',
                birthDate: formData.birthDate
            },
            ownership: {
                documents: [], // Skip documents for now to avoid file object issues
                verified: savedProofs.length > 0
            }
        };

        // Save to localStorage
        localStorage.setItem('kitnets_draft_listing', JSON.stringify(draftListing));

        // Redirect to review step
        window.location.href = `/pt/anunciar?step=review&hydrate=true`;
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            {showSuccess && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-100 border border-emerald-300 text-emerald-800 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    <div>
                        <h4 className="font-bold text-sm">Sucesso!</h4>
                        <p className="text-xs">Perfil e documentos salvos.</p>
                    </div>
                </div>
            )}

            {/* Header / Overview */}
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="relative group w-20 h-20 rounded-full bg-slate-200 border-4 border-white dark:bg-slate-800 dark:border-slate-700 shadow-sm flex items-center justify-center overflow-hidden">
                        <Image
                            src={user.imageUrl}
                            alt={user.fullName || ''}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover"
                        />
                        <label className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-xs font-medium text-center">
                            {p.header.changePhoto}
                            <input type="file" className="hidden" accept="image/*" onChange={handleProfileImageUpload} />
                        </label>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{formData.name || user.fullName}</h1>
                        <p className="text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {p.header.emailVerified}</span>
                            {!savedProofs.some(pr => pr.status === 'approved') && <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {p.header.verificationPending}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Button className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-600 text-amber-950 font-bold border-0 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 gap-2 px-6">
                        {p.header.verifyProfile} <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">{p.header.premium}</span>
                    </Button>
                </div>
            </div>

            {/* Progress Bar Section (Above Tabs) */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium items-end">
                    <span className="text-muted-foreground">{p.progress.completion}</span>
                    <span className={`${isVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{progress}% {isVerified && p.progress.verified}</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden shadow-inner">
                    <div
                        className={`h-full transition-all duration-700 ease-out ${getProgressColor()}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
                {!isVerified && progress === 100 && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 font-medium text-right mt-1">{p.progress.verifyBadge}</p>
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-border flex overflow-x-auto">
                {tabs.map((tab: { id: string; label: string }) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={cn(
                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                            activeTab === tab.id
                                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="bg-card text-card-foreground rounded-xl border border-border p-6 min-h-[400px] shadow-sm">

                {/* OWNERSHIP TAB */}
                {activeTab === 'ownership' && (
                    <div className="space-y-8 max-w-4xl">

                        {/* 1. Address Section */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg text-emerald-600">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">{p.basics.addressTitle}</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label>{p.basics.cep}</Label>
                                    <div className="relative">
                                        <Input
                                            value={formData.propertyAddress.cep}
                                            onChange={(e) => handleAddressChange('propertyAddress', 'cep', e.target.value)}
                                            placeholder="00000-000"
                                            maxLength={9}
                                        />
                                        {isLoadingAddress && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                                    </div>
                                    {cepError && <p className="text-xs text-red-500">{cepError}</p>}
                                </div>
                                <div className="md:col-span-3 space-y-2">
                                    <Label>Cidade / UF</Label>
                                    <div className="flex gap-2">
                                        <Input value={formData.propertyAddress.city} onChange={(e) => handleAddressChange('propertyAddress', 'city', e.target.value)} placeholder="Cidade" />
                                        <Input value={formData.propertyAddress.state} onChange={(e) => handleAddressChange('propertyAddress', 'state', e.target.value)} placeholder="UF" className="w-20" maxLength={2} />
                                    </div>
                                </div>
                                <div className="md:col-span-3 space-y-2">
                                    <Label>{p.basics.street}</Label>
                                    <Input value={formData.propertyAddress.street} onChange={(e) => handleAddressChange('propertyAddress', 'street', e.target.value)} placeholder="Rua / Avenida" />
                                </div>
                                <div className="space-y-2">
                                    <Label>{p.basics.number}</Label>
                                    <Input value={formData.propertyAddress.number} onChange={(e) => handleAddressChange('propertyAddress', 'number', e.target.value)} placeholder="123" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <Label>{p.basics.neighborhood}</Label>
                                    <Input value={formData.propertyAddress.neighborhood} onChange={(e) => handleAddressChange('propertyAddress', 'neighborhood', e.target.value)} placeholder="Bairro" />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <Label>{p.basics.complement}</Label>
                                    <Input value={formData.propertyAddress.complement} onChange={(e) => handleAddressChange('propertyAddress', 'complement', e.target.value)} placeholder={p.basics.complement} />
                                </div>
                            </div>
                        </div>

                        {/* 2. Documentation Section */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-600">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">{p.ownership.title}</h3>
                            </div>

                            <div className="bg-muted/30 p-4 rounded-lg border border-border text-sm text-muted-foreground mb-4">
                                <p className="font-medium text-foreground mb-2">{p.ownership.acceptedDocs}</p>
                                <ul className="list-disc list-inside space-y-1 ml-1">
                                    <li>{p.ownership.docs.utility}</li>
                                    <li>{p.ownership.docs.iptu}</li>
                                    <li>{p.ownership.docs.purchase}</li>
                                    <li>{p.ownership.docs.registry}</li>
                                    <li>{p.ownership.docs.deed}</li>
                                </ul>
                            </div>

                            <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center hover:bg-muted/50 transition-colors relative">
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center mb-2">
                                    <UploadCloud className="w-6 h-6" />
                                </div>
                                <p className="font-medium text-foreground">{p.ownership.uploadPlaceholder}</p>
                                <p className="text-xs text-muted-foreground mt-1">{p.ownership.uploadDrop}</p>
                            </div>

                            {/* File List */}
                            {(ownershipFiles.length > 0 || savedProofs.length > 0) && (
                                <div className="space-y-2 mt-4">
                                    {ownershipFiles.map((file, i) => (
                                        <div key={`new-${i}`} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border flex items-center justify-center flex-shrink-0">
                                                    <FileText className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <p className="text-sm font-medium truncate pr-4">{file.name}</p>
                                                    <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB • Pronto para enviar</span>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => removeFile(i)} className="text-destructive">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {savedProofs.map((proof) => (
                                        <div key={proof.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border opacity-75">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{proof.original_name}</p>
                                                    <p className="text-xs text-muted-foreground">Enviado em {new Date(proof.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 3. Photos Section */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600">
                                    <Camera className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">Fotos do Imóvel</h3>
                            </div>

                            <div className="bg-muted/30 p-4 rounded-lg border border-border flex gap-3 items-start">
                                <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-foreground mb-1">Dica Profissional</p>
                                    <p className="text-sm text-muted-foreground">Imóveis com pelo menos 5 fotos recebem 4x mais visualizações! Capriche na iluminação.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                {/* Upload Button */}
                                <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        onChange={handlePhotoSelect}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                                    <span className="text-xs text-muted-foreground">Adicionar Fotos</span>
                                </div>

                                {/* New Photos */}
                                {propertyPhotos.map((file, idx) => (
                                    <PhotoPreview key={`new-p-${idx}`} file={file} onRemove={() => removePhoto(idx)} />
                                ))}

                                {/* Saved Photos */}
                                {savedPhotos.map((url, idx) => (
                                    <div key={`saved-p-${idx}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden">
                                        <Image src={url} alt="Property" width={200} height={200} className="w-full h-full object-cover" />
                                        <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removeSavedPhoto(url)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. Description Section */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">Descrição do Imóvel</h3>
                            </div>
                            <div className="space-y-2">
                                <Label>Descreva seu imóvel em detalhes</Label>
                                <textarea
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]"
                                    placeholder="Ex: Excelente apartamento com varanda gourmet, vista livre, armários planejados na cozinha e banheiros..."
                                    value={formData.propertyAddress.description || ''}
                                    onChange={(e) => handleAddressChange('propertyAddress', 'description', e.target.value)}
                                />
                                <span className="text-xs text-muted-foreground">Esta descrição será exibida no anúncio do imóvel.</span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button size="lg" onClick={handleSave} disabled={isSaving} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                Salvar Imóvel e Documentos
                            </Button>
                        </div>
                    </div>
                )}


                {/* BASICS TAB - Only Profile Info now */}
                {activeTab === 'basics' && (
                    <div className="space-y-6">
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <h3 className="text-lg font-semibold mb-4">Seus Dados Pessoais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-foreground">{p.basics.fullName}</Label>
                                    <Input
                                        value={formData.name || ''}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                    />
                                    <span className="text-xs text-muted-foreground">{p.basics.nameHelp}</span>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">{p.basics.email}</Label>
                                    <Input value={user.primaryEmailAddress?.emailAddress || ''} disabled className="bg-muted text-muted-foreground" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">{p.basics.phone}</Label>
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">{p.basics.birthDate}</Label>
                                    <Input
                                        type="date"
                                        value={formData.birthDate}
                                        onChange={(e) => handleInputChange('birthDate', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-foreground">{p.basics.cpf}</Label>
                                    <Input
                                        value={formData.cpf}
                                        onChange={(e) => handleInputChange('cpf', e.target.value)}
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                            </div>

                            {/* OWNER ADDRESS SECTION */}
                            <div className="pt-6 border-t border-border mt-6">
                                <h4 className="font-semibold mb-4 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                    Endereço do Proprietário (Residencial)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label>{p.basics.cep}</Label>
                                        <div className="relative">
                                            <Input
                                                value={formData.ownerAddress.cep}
                                                onChange={(e) => handleAddressChange('ownerAddress', 'cep', e.target.value)}
                                                placeholder="00000-000"
                                                maxLength={9}
                                            />
                                            {isLoadingAddress && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                                        </div>
                                    </div>
                                    <div className="md:col-span-3 space-y-2">
                                        <Label>Cidade / UF</Label>
                                        <div className="flex gap-2">
                                            <Input value={formData.ownerAddress.city} onChange={(e) => handleAddressChange('ownerAddress', 'city', e.target.value)} placeholder="Cidade" />
                                            <Input value={formData.ownerAddress.state} onChange={(e) => handleAddressChange('ownerAddress', 'state', e.target.value)} placeholder="UF" className="w-20" maxLength={2} />
                                        </div>
                                    </div>
                                    <div className="md:col-span-3 space-y-2">
                                        <Label>{p.basics.street}</Label>
                                        <Input value={formData.ownerAddress.street} onChange={(e) => handleAddressChange('ownerAddress', 'street', e.target.value)} placeholder="Rua / Avenida" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{p.basics.number}</Label>
                                        <Input value={formData.ownerAddress.number} onChange={(e) => handleAddressChange('ownerAddress', 'number', e.target.value)} placeholder="123" />
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <Label>{p.basics.neighborhood}</Label>
                                        <Input value={formData.ownerAddress.neighborhood} onChange={(e) => handleAddressChange('ownerAddress', 'neighborhood', e.target.value)} placeholder="Bairro" />
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <Label>{p.basics.complement}</Label>
                                        <Input value={formData.ownerAddress.complement} onChange={(e) => handleAddressChange('ownerAddress', 'complement', e.target.value)} placeholder="Apto 101" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button size="lg" onClick={handleSave} disabled={isSaving} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                {p.basics.save}
                            </Button>
                        </div>
                    </div>
                )}


                {/* SECURITY TAB */}
                {/* SECURITY TAB */}
                {activeTab === 'security' && (
                    <div className="space-y-6">
                        {/* Card 0: Quick Actions */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <h3 className="text-lg font-semibold text-foreground mb-4">Ações Rápidas</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Button className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleQuickPublish('rent')}>
                                    <Home className="w-4 h-4" />
                                    Anunciar Aluguel
                                </Button>
                                <Button className="w-full flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleQuickPublish('sale')}>
                                    <Sparkles className="w-4 h-4" />
                                    Anunciar Venda
                                </Button>
                                <Button className="w-full flex items-center gap-2" variant="outline" onClick={() => window.location.href = '/dashboard'}>
                                    <FileText className="w-4 h-4" />
                                    Gerenciar Aluguel
                                </Button>
                                <Button className="w-full flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-amber-900/10 shadow-lg" onClick={() => alert('Premium feature coming soon!')}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Verificar Premium
                                </Button>
                            </div>
                        </div>

                        {/* Card 1: Notifications */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground mb-4">Preferências de Notificação</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label>Receber e-mails marketing</Label>
                                        <Input type="checkbox" className="w-4 h-4" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Receber alertas de segurança</Label>
                                        <Input type="checkbox" className="w-4 h-4" defaultChecked />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Delete Account */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-red-600 mb-4">{p.deleteModal.title}</h3>
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">{p.deleteModal.irreversible}</p>
                                    <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                                        {p.deleteModal.confirm}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Delete Account Modal (Simple Overlay) */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl border border-border">
                        <h3 className="text-xl font-bold text-foreground">{p.deleteModal.title}</h3>
                        <p className="text-muted-foreground">{p.deleteModal.irreversible}</p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>{p.deleteModal.cancel}</Button>
                            <Button
                                variant="destructive"
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                            >
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {p.deleteModal.confirm}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
