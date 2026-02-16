"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { CheckCircle2, AlertTriangle, FileText, Loader2, Trash2, MapPin, Camera, Sparkles, Save, UploadCloud, Home, Building2, User, ShieldCheck, Fingerprint } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser, useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
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
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

    // Success State
    const [showSuccess, setShowSuccess] = useState(false);

    // Data state
    const [ownershipFiles, setOwnershipFiles] = useState<File[]>([]); // New files to upload
    const [propertyPhotos, setPropertyPhotos] = useState<File[]>([]); // New photos
    const [savedProofs, setSavedProofs] = useState<ProofData[]>([]); // Saved in DB
    const [savedPhotos, setSavedPhotos] = useState<string[]>([]); // Saved URLs
    const [profileId, setProfileId] = useState<string | null>(null);

    // Identity verification state
    const [identityFile, setIdentityFile] = useState<File | null>(null);
    const [isAnalyzingIdentity, setIsAnalyzingIdentity] = useState(false);
    const [identityResult, setIdentityResult] = useState<Record<string, unknown> | null>(null);
    const [identityError, setIdentityError] = useState<string | null>(null);

    // Person type toggle: 'pf' = Pessoa Física, 'pj' = Pessoa Jurídica
    const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        cpf: '',
        birthDate: '',
        // PJ fields
        cnpj: '',
        businessName: '',   // Razão Social
        tradeName: '',       // Nome Fantasia
        registrationStatusDate: '', // Data da Situação Cadastral
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
        if (!token) {
            console.warn('[Profile] Supabase JWT token is null — queries will fail silently under RLS.');
        }
        return createClient(
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
            setProfileLoadError(null);
            try {
                const sb = await getSupabase();

                // Use .maybeSingle() instead of .single() — returns null (no error) when 0 rows found
                const { data: profile, error: fetchError } = await sb
                    .from('profiles')
                    .select('*')
                    .eq('clerk_id', user.id)
                    .maybeSingle();

                if (fetchError) {
                    console.error('[Profile] Supabase fetch error:', fetchError.code, fetchError.message, fetchError.details);
                    setProfileLoadError(`Erro ao carregar perfil: ${fetchError.message} (${fetchError.code})`);
                    // Still try to populate from Clerk defaults
                    setFormData(prev => ({
                        ...prev,
                        name: user.fullName || '',
                        phone: user.phoneNumbers[0]?.phoneNumber || '',
                    }));
                    return;
                }

                if (profile) {
                    console.log('[Profile] Loaded profile:', profile.id, 'clerk_id:', profile.clerk_id);
                    setProfileId(profile.id);
                    if (profile.person_type) setPersonType(profile.person_type as 'pf' | 'pj');
                    setFormData({
                        name: profile.full_name || user.fullName || '',
                        phone: profile.phone || user.phoneNumbers[0]?.phoneNumber || '',
                        cpf: profile.cpf || '',
                        birthDate: profile.birth_date || '',
                        cnpj: profile.cnpj || '',
                        businessName: profile.business_name || '',
                        tradeName: profile.trade_name || '',
                        registrationStatusDate: profile.registration_status_date || '',
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
                    // No profile exists in DB — new user, populate from Clerk
                    console.log('[Profile] No Supabase profile found for clerk_id:', user.id, '— showing Clerk defaults');
                    setFormData(prev => ({
                        ...prev,
                        name: user.fullName || '',
                        phone: user.phoneNumbers[0]?.phoneNumber || '',
                    }));
                }
            } catch (err) {
                console.error('[Profile] Unexpected error loading profile:', err);
                setProfileLoadError('Erro inesperado ao carregar perfil. Verifique o console.');
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

    const formatCNPJ = (value: string) => {
        return value
            .replace(/\D/g, "")
            .replace(/(\d{2})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1/$2")
            .replace(/(\d{4})(\d{1,2})/, "$1-$2")
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

        if (field === 'cnpj') {
            formattedValue = formatCNPJ(value);
            const plainCnpj = formattedValue.replace(/\D/g, '');

            // Trigger CNPJ enrichment when complete (14 digits)
            if (plainCnpj.length === 14 && plainCnpj !== formData.cnpj.replace(/\D/g, '')) {
                fetchCnpjData(plainCnpj);
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
            }
        } catch (error) {
            console.error("Enrichment failed", error);
        } finally {
            setIsLoadingEnrichment(false);
        }
    };

    const fetchCnpjData = async (cnpj: string) => {
        setIsLoadingEnrichment(true);
        try {
            // Using ReceitaWS public API for CNPJ lookup
            const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
            if (!res.ok) {
                console.warn(`CNPJ enrichment failed: ${res.status}`);
                return;
            }
            const data = await res.json();

            if (data.status === 'OK') {
                setFormData(prev => ({
                    ...prev,
                    businessName: prev.businessName || data.nome || '',
                    tradeName: prev.tradeName || data.fantasia || '',
                    name: prev.name || data.nome || '',
                    registrationStatusDate: prev.registrationStatusDate || (data.data_situacao_cadastral ? data.data_situacao_cadastral.split('/').reverse().join('-') : ''),
                    phone: prev.phone || (data.telefone ? formatPhone(data.telefone.replace(/[^\d]/g, '')) : prev.phone),
                }));

                // Auto-fill address if available
                if (data.cep) {
                    setFormData(prev => ({
                        ...prev,
                        ownerAddress: {
                            ...prev.ownerAddress,
                            cep: prev.ownerAddress.cep || formatCEP(data.cep.replace(/[^\d]/g, '')),
                            street: prev.ownerAddress.street || data.logradouro || '',
                            number: prev.ownerAddress.number || data.numero || '',
                            neighborhood: prev.ownerAddress.neighborhood || data.bairro || '',
                            city: prev.ownerAddress.city || data.municipio || '',
                            state: prev.ownerAddress.state || data.uf || '',
                            complement: prev.ownerAddress.complement || data.complemento || '',
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('CNPJ enrichment failed', error);
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

    const handleIdentityAnalysis = async (file: File) => {
        setIsAnalyzingIdentity(true);
        setIdentityError(null);
        setIdentityResult(null);

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('category', personType);

            const res = await fetch('/api/identity/verify', {
                method: 'POST',
                body: fd,
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setIdentityError(data.error || 'Não foi possível analisar o documento. Tente outro arquivo.');
                return;
            }

            setIdentityResult(data);

            // Auto-fill form fields from extracted data
            if (data.extracted_data) {
                const ext = data.extracted_data;
                if (personType === 'pf') {
                    setFormData(prev => ({
                        ...prev,
                        name: prev.name || ext.nome || '',
                        cpf: prev.cpf || ext.cpf || '',
                        birthDate: prev.birthDate || ext.data_nascimento || '',
                    }));
                } else {
                    setFormData(prev => ({
                        ...prev,
                        cnpj: prev.cnpj || ext.cnpj || '',
                        businessName: prev.businessName || ext.razao_social || '',
                        tradeName: prev.tradeName || ext.nome_fantasia || '',
                        registrationStatusDate: prev.registrationStatusDate || ext.data_situacao_cadastral || '',
                        name: prev.name || ext.razao_social || '',
                        phone: prev.phone || ext.telefone || '',
                    }));
                    // Auto-fill address if available
                    if (ext.endereco) {
                        setFormData(prev => ({
                            ...prev,
                            ownerAddress: {
                                ...prev.ownerAddress,
                                street: prev.ownerAddress.street || ext.endereco.logradouro || '',
                                number: prev.ownerAddress.number || ext.endereco.numero || '',
                                neighborhood: prev.ownerAddress.neighborhood || ext.endereco.bairro || '',
                                city: prev.ownerAddress.city || ext.endereco.municipio || '',
                                state: prev.ownerAddress.state || ext.endereco.uf || '',
                                cep: prev.ownerAddress.cep || ext.endereco.cep || '',
                                complement: prev.ownerAddress.complement || ext.endereco.complemento || '',
                            }
                        }));
                    }
                }
            }
        } catch (err) {
            console.error('Identity analysis error:', err);
            setIdentityError('Erro de conexão ao analisar documento. Tente novamente.');
        } finally {
            setIsAnalyzingIdentity(false);
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

            const profilePayload: Record<string, unknown> = {
                clerk_id: user.id,
                full_name: formData.name,
                email: user.primaryEmailAddress?.emailAddress,
                phone: formData.phone,
                person_type: personType,
                address: formData.ownerAddress,
                property_address: formData.propertyAddress,
                role: 'landlord'
            };

            // Conditionally set PF or PJ fields
            if (personType === 'pf') {
                profilePayload.cpf = formData.cpf;
                profilePayload.birth_date = formData.birthDate || null;
                // Clear PJ fields
                profilePayload.cnpj = null;
                profilePayload.business_name = null;
                profilePayload.trade_name = null;
                profilePayload.registration_status_date = null;
            } else {
                profilePayload.cnpj = formData.cnpj;
                profilePayload.business_name = formData.businessName;
                profilePayload.trade_name = formData.tradeName;
                profilePayload.registration_status_date = formData.registrationStatusDate || null;
                // Clear PF fields
                profilePayload.cpf = null;
                profilePayload.birth_date = null;
            }

            // Only generate new ID if we don't have one loaded
            if (!profileId) {
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
        const total = 8;

        if (formData.name) completed++;
        if (formData.phone) completed++;
        // CPF or CNPJ depending on person type
        if (personType === 'pf') {
            if (formData.cpf) completed++;
            if (formData.birthDate) completed++;
        } else {
            if (formData.cnpj) completed++;
            if (formData.businessName) completed++;
        }
        if (formData.ownerAddress.cep && formData.ownerAddress.city && formData.ownerAddress.state) completed++;
        if (formData.propertyAddress.cep && formData.propertyAddress.city && formData.propertyAddress.state) completed++;
        if (user?.primaryEmailAddress?.emailAddress) completed++;
        if (user?.imageUrl) completed++;
        if (savedProofs.length > 0) completed++;

        const isVerified = false;
        const rawPercentage = Math.round((completed / total) * 100);
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
            {/* Profile Load Error Banner */}
            {profileLoadError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-6 py-4 rounded-xl shadow flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                        <h4 className="font-bold text-sm">Erro ao carregar perfil</h4>
                        <p className="text-xs mt-0.5">{profileLoadError}</p>
                        <p className="text-xs mt-1 text-red-600 dark:text-red-400">Verifique se o JWT template &quot;supabase&quot; está configurado no Clerk. Abra o console do navegador (F12) para mais detalhes.</p>
                    </div>
                </div>
            )}

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

                        {/* 1. Documentation Section (ownership verification — first!) */}
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

                        {/* 2. Address Section */}
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


                {/* BASICS TAB - Profile Info with PF/PJ Toggle */}
                {activeTab === 'basics' && (
                    <div className="space-y-6">
                        {/* IDENTITY VERIFICATION — First, so user doesn't type manually */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600">
                                    <Fingerprint className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">Verificação de Identidade</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {personType === 'pf'
                                    ? 'Envie uma foto ou scan do seu documento de identidade (CNH ou RG). Os dados serão preenchidos automaticamente.'
                                    : 'Envie o Comprovante de Inscrição e de Situação Cadastral do CNPJ (PDF disponível em gov.br). Os dados serão preenchidos automaticamente.'}
                            </p>

                            {/* PF/PJ quick toggle for identity */}
                            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl w-fit">
                                <button
                                    type="button"
                                    onClick={() => setPersonType('pf')}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                        personType === 'pf'
                                            ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <User className="w-4 h-4" />
                                    Pessoa Física
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPersonType('pj')}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                        personType === 'pj'
                                            ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Building2 className="w-4 h-4" />
                                    Pessoa Jurídica
                                </button>
                            </div>

                            {/* File upload area */}
                            {!identityFile && !identityResult && (
                                <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center hover:bg-muted/50 transition-colors relative">
                                    <input
                                        type="file"
                                        accept={personType === 'pf' ? 'image/*,.pdf' : '.pdf,image/*'}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) {
                                                setIdentityFile(f);
                                                setIdentityError(null);
                                                setIdentityResult(null);
                                                handleIdentityAnalysis(f);
                                            }
                                        }}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 flex items-center justify-center mb-2">
                                        <ShieldCheck className="w-6 h-6" />
                                    </div>
                                    <p className="font-medium text-foreground">
                                        {personType === 'pf' ? 'Enviar CNH ou RG' : 'Enviar Comprovante CNPJ'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {personType === 'pf'
                                            ? 'Formatos aceitos: JPG, PNG, PDF (frente do documento)'
                                            : 'Formatos aceitos: PDF (Comprovante de Inscrição e Situação Cadastral)'}
                                    </p>
                                </div>
                            )}

                            {/* Analyzing state */}
                            {isAnalyzingIdentity && identityFile && (
                                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-6 flex items-center gap-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                    <div>
                                        <p className="font-medium text-foreground">Analisando documento...</p>
                                        <p className="text-sm text-muted-foreground">{identityFile.name}</p>
                                    </div>
                                </div>
                            )}

                            {/* Success result */}
                            {identityResult && identityResult.success && !isAnalyzingIdentity ? (() => {
                                const docType = String(identityResult.document_type || '');
                                const method = String(identityResult.extraction_method || '');
                                const ext = (identityResult.extracted_data || {}) as Record<string, unknown>;
                                return (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                            <div>
                                                <p className="font-medium text-foreground">Documento verificado com sucesso</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Tipo: {docType} &bull; Método: {method === 'pdf_text_parse' ? 'Extração de texto (sem IA)' : method.startsWith('pdf_text_ai') ? `IA texto (${method.includes('gemini') ? 'Gemini' : 'GPT'})` : method.includes('gemini') ? 'IA visão (Gemini)' : 'IA visão (GPT)'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-border">
                                            <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Dados Extraídos</p>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                {personType === 'pf' && (
                                                    <>
                                                        {ext.nome && (<><span className="text-muted-foreground">Nome:</span><span className="font-medium">{String(ext.nome)}</span></>)}
                                                        {ext.cpf && (<><span className="text-muted-foreground">CPF:</span><span className="font-medium">{String(ext.cpf)}</span></>)}
                                                        {ext.data_nascimento && (<><span className="text-muted-foreground">Nascimento:</span><span className="font-medium">{String(ext.data_nascimento)}</span></>)}
                                                        {ext.rg && (<><span className="text-muted-foreground">RG:</span><span className="font-medium">{String(ext.rg)}</span></>)}
                                                    </>
                                                )}
                                                {personType === 'pj' && (
                                                    <>
                                                        {ext.cnpj && (<><span className="text-muted-foreground">CNPJ:</span><span className="font-medium">{String(ext.cnpj)}</span></>)}
                                                        {ext.razao_social && (<><span className="text-muted-foreground">Razão Social:</span><span className="font-medium">{String(ext.razao_social)}</span></>)}
                                                        {ext.nome_fantasia && (<><span className="text-muted-foreground">Fantasia:</span><span className="font-medium">{String(ext.nome_fantasia)}</span></>)}
                                                        {ext.situacao_cadastral && (<><span className="text-muted-foreground">Situação:</span><span className="font-medium">{String(ext.situacao_cadastral)}</span></>)}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIdentityFile(null);
                                                setIdentityResult(null);
                                                setIdentityError(null);
                                            }}
                                            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium"
                                        >
                                            Substituir documento
                                        </button>
                                    </div>
                                );
                            })() : null}

                            {/* Error */}
                            {identityError && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-red-700 dark:text-red-300">{identityError}</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIdentityFile(null);
                                                setIdentityResult(null);
                                                setIdentityError(null);
                                            }}
                                            className="text-sm text-red-600 hover:underline mt-1"
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
                            {/* PF/PJ Toggle Switch */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Dados do Proprietário</h3>
                                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl w-fit">
                                    <button
                                        type="button"
                                        onClick={() => setPersonType('pf')}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                            personType === 'pf'
                                                ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <User className="w-4 h-4" />
                                        Pessoa Física
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPersonType('pj')}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                            personType === 'pj'
                                                ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Building2 className="w-4 h-4" />
                                        Pessoa Jurídica
                                    </button>
                                </div>
                            </div>

                            {/* Common Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-foreground">
                                        {personType === 'pj' ? 'Razão Social' : p.basics.fullName}
                                    </Label>
                                    <Input
                                        value={formData.name || ''}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder={personType === 'pj' ? 'Nome da empresa' : 'Seu nome completo'}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {personType === 'pj' ? 'Nome registrado na Receita Federal' : p.basics.nameHelp}
                                    </span>
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

                                {/* PF-specific fields */}
                                {personType === 'pf' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">{p.basics.cpf}</Label>
                                            <div className="relative">
                                                <Input
                                                    value={formData.cpf}
                                                    onChange={(e) => handleInputChange('cpf', e.target.value)}
                                                    placeholder="000.000.000-00"
                                                />
                                                {isLoadingEnrichment && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">{p.basics.birthDate}</Label>
                                            <Input
                                                type="date"
                                                value={formData.birthDate}
                                                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* PJ-specific fields */}
                                {personType === 'pj' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">CNPJ</Label>
                                            <div className="relative">
                                                <Input
                                                    value={formData.cnpj}
                                                    onChange={(e) => handleInputChange('cnpj', e.target.value)}
                                                    placeholder="00.000.000/0000-00"
                                                />
                                                {isLoadingEnrichment && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-emerald-500" />}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                Ao digitar o CNPJ completo, os dados serão preenchidos automaticamente via Receita Federal.
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Nome Fantasia</Label>
                                            <Input
                                                value={formData.tradeName}
                                                onChange={(e) => handleInputChange('tradeName', e.target.value)}
                                                placeholder="Nome comercial da empresa"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Razão Social</Label>
                                            <Input
                                                value={formData.businessName}
                                                onChange={(e) => handleInputChange('businessName', e.target.value)}
                                                placeholder="Nome registrado na Receita"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Data da Situação Cadastral</Label>
                                            <Input
                                                type="date"
                                                value={formData.registrationStatusDate}
                                                onChange={(e) => handleInputChange('registrationStatusDate', e.target.value)}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                Data da última alteração cadastral na Receita Federal.
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* OWNER ADDRESS SECTION */}
                            <div className="pt-6 border-t border-border mt-6">
                                <h4 className="font-semibold mb-4 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                    {personType === 'pj' ? 'Endereço' : 'Endereço do Proprietário (Residencial)'}
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
