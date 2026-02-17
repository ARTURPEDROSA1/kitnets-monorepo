"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@kitnets/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { CheckCircle2, AlertTriangle, FileText, Loader2, Trash2, MapPin, Camera, Video, Sparkles, Save, UploadCloud, Home, Building2, User, ShieldCheck, Fingerprint, ChevronDown, ChevronUp, Wand2, Plus, ArrowRight } from 'lucide-react';
import PropertyDetailsCard, { PropertyDetails, SubUnit, SubUnitsSection, Checkbox as DetailCheckbox } from '@/components/profile/PropertyDetailsCard';
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
    const preview = useMemo(() => URL.createObjectURL(file), [file]);

    useEffect(() => {
        return () => URL.revokeObjectURL(preview);
    }, [preview]);


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

    // Tabs (after personType so we can use it for dynamic labels)
    const tabs = [
        { id: 'ownership', label: p.tabs.ownership },
        { id: 'basics', label: personType === 'pj' ? 'Dados da Holding' : p.tabs.basics },
        { id: 'security', label: p.tabs.security },
    ];

    // Property type: single-family or multi-family
    const [propertyType, setPropertyType] = useState<'single' | 'multi'>('single');

    // Property details & sub-units
    const [propertyDetails, setPropertyDetails] = useState<PropertyDetails>({
        propertyName: '',
        cadastroImobiliario: '',
        inscricaoImobiliaria: '',
        matricula: '',
        areaLote: '',
        areaEdificada: '',
        numberOfUnits: 0,
        totalSqMeters: '',
        solarEnergy: false,
        solarKwp: '',
        mainMeters: { water: false, energy: false, gas: false },
        internetBill: false,
    });
    const [subUnits, setSubUnits] = useState<SubUnit[]>([]);

    // Main property videos
    const [propertyVideos, setPropertyVideos] = useState<File[]>([]);
    const [savedVideos, setSavedVideos] = useState<string[]>([]);

    // Collapsible section states for ownership tab
    const [addressSectionOpen, setAddressSectionOpen] = useState(true);
    const [photosSectionOpen, setPhotosSectionOpen] = useState(true);
    const [descriptionSectionOpen, setDescriptionSectionOpen] = useState(true);
    const [detailsInitialOpen, setDetailsInitialOpen] = useState(true);

    // Add Property modal + wizard
    const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
    const [propertyCreated, setPropertyCreated] = useState(false);

    // Holding tab collapsible states
    const [holdingSectionOpen, setHoldingSectionOpen] = useState(true);
    const [adminSectionOpen, setAdminSectionOpen] = useState(true);

    // AI description generation states
    const [generatingMainDescription, setGeneratingMainDescription] = useState(false);
    const [generatingUnitDescriptionIdx, setGeneratingUnitDescriptionIdx] = useState<number | null>(null);
    const [descriptionPurpose, setDescriptionPurpose] = useState<{ venda: boolean; aluguel: boolean }>({ venda: false, aluguel: true });
    const [importingContractIdx, setImportingContractIdx] = useState<number | null>(null);

    // Administrator data (only for PJ)
    const [adminData, setAdminData] = useState({
        name: '',
        email: '',
        phone: '',
        address: {
            cep: '',
            street: '',
            number: '',
            city: '',
            state: '',
            neighborhood: '',
            complement: ''
        }
    });

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
                    if (profile.property_type) setPropertyType(profile.property_type as 'single' | 'multi');
                    if (profile.admin_data) {
                        const ad = profile.admin_data as Record<string, unknown>;
                        setAdminData({
                            name: (ad.name as string) || '',
                            email: (ad.email as string) || '',
                            phone: (ad.phone as string) || '',
                            address: (ad.address as typeof adminData.address) || { cep: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '' }
                        });
                    }
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

                    // Auto-collapse address section if already filled
                    if (profile.property_address?.street) {
                        setAddressSectionOpen(false);
                    }

                    // Load photos & videos
                    if (profile.property_photos && Array.isArray(profile.property_photos)) {
                        setSavedPhotos(profile.property_photos);
                    }
                    if (profile.property_videos && Array.isArray(profile.property_videos)) {
                        setSavedVideos(profile.property_videos);
                    }

                    // Load property details & sub-units
                    if (profile.property_details) {
                        const pd = profile.property_details as PropertyDetails;
                        setPropertyDetails({
                            propertyName: pd.propertyName || '',
                            cadastroImobiliario: pd.cadastroImobiliario || '',
                            inscricaoImobiliaria: pd.inscricaoImobiliaria || '',
                            matricula: pd.matricula || '',
                            areaLote: pd.areaLote || '',
                            areaEdificada: pd.areaEdificada || '',
                            numberOfUnits: pd.numberOfUnits || 0,
                            totalSqMeters: pd.totalSqMeters || '',
                            solarEnergy: pd.solarEnergy || false,
                            solarKwp: pd.solarKwp || '',
                            mainMeters: pd.mainMeters || { water: false, energy: false, gas: false },
                            internetBill: pd.internetBill || false,
                        });
                        // Auto-collapse Detalhes if area is filled (and numberOfUnits for multi)
                        if (pd.totalSqMeters) {
                            setDetailsInitialOpen(false);
                        }
                    }
                    if (profile.sub_units && Array.isArray(profile.sub_units)) {
                        setSubUnits(profile.sub_units as SubUnit[]);
                    }

                    // Mark property as created if a type was saved
                    if (profile.property_type) {
                        setPropertyCreated(true);
                    }

                    // Auto-collapse Photos if 2+ photos already saved
                    if (profile.property_photos && Array.isArray(profile.property_photos) && profile.property_photos.length >= 2) {
                        setPhotosSectionOpen(false);
                    }

                    // Auto-collapse Description if already filled
                    if (profile.property_address?.description) {
                        setDescriptionSectionOpen(false);
                    }

                    // Load proofs
                    const { data: proofs } = await sb
                        .from('ownership_proofs')
                        .select('*')
                        .eq('profile_id', profile.id)
                        .order('created_at', { ascending: false });

                    if (proofs) {
                        setSavedProofs(proofs as ProofData[]);
                        // Auto-collapse ownership section if proofs exist
                        if (proofs.length > 0) setOwnershipSectionOpen(false);
                    }
                    // Auto-collapse identity section if identity verification data exists
                    if (profile.cpf || profile.cnpj || profile.business_name) {
                        setIdentitySectionOpen(false);
                    }
                    // Auto-collapse holding/admin sections if data exists
                    if (profile.full_name && profile.phone) {
                        setHoldingSectionOpen(false);
                    }
                    if (profile.admin_data?.name) {
                        setAdminSectionOpen(false);
                    }
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

    const handleAddressChange = (type: 'ownerAddress' | 'propertyAddress' | 'adminAddress', field: string, value: string) => {
        let formattedValue = value;
        if (field === 'cep') {
            formattedValue = formatCEP(value);
            if (formattedValue.length === 9) fetchAddress(type, formattedValue);
        }

        if (type === 'adminAddress') {
            setAdminData(prev => ({
                ...prev,
                address: { ...prev.address, [field]: formattedValue }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [type]: { ...prev[type], [field]: formattedValue }
            }));
        }
    };

    const fetchAddress = async (type: 'ownerAddress' | 'propertyAddress' | 'adminAddress', cep: string) => {
        setIsLoadingAddress(true);
        setCepError("");
        const cleanCep = cep.replace(/\D/g, "");

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                setCepError(p.basics.cepNotFound);
            } else if (type === 'adminAddress') {
                setAdminData(prev => ({
                    ...prev,
                    address: {
                        ...prev.address,
                        street: data.logradouro,
                        neighborhood: data.bairro,
                        city: data.localidade,
                        state: data.uf
                    }
                }));
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
    const [fileAnalysisStatus, setFileAnalysisStatus] = useState<Record<string, 'analyzing' | 'success' | 'error'>>({});
    const [ownershipSectionOpen, setOwnershipSectionOpen] = useState(true);
    const [identitySectionOpen, setIdentitySectionOpen] = useState(true);

    const removeFile = (index: number) => {
        setOwnershipFiles(prev => {
            const removed = prev[index];
            if (removed) {
                setFileAnalysisStatus(s => {
                    const next = { ...s };
                    delete next[removed.name];
                    return next;
                });
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setOwnershipFiles(prev => [...prev, ...newFiles]);

            // Trigger analysis for each new file immediately
            for (const file of newFiles) {
                analyzeDocument(file);
            }
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const totalPhotos = savedPhotos.length + propertyPhotos.length;
            const remaining = 10 - totalPhotos;
            if (remaining <= 0) { alert('Máximo de 10 fotos para o imóvel principal.'); return; }
            const newPhotos = Array.from(e.target.files).slice(0, remaining);
            setPropertyPhotos(prev => [...prev, ...newPhotos]);
        }
    };

    const removePhoto = (index: number) => {
        setPropertyPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const removeSavedPhoto = async (url: string) => {
        setSavedPhotos(prev => prev.filter(u => u !== url));
    };

    const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const totalVideos = savedVideos.length + propertyVideos.length;
            const remaining = 2 - totalVideos;
            if (remaining <= 0) { alert('Máximo de 2 vídeos para o imóvel principal.'); return; }
            const newVideos = Array.from(e.target.files).slice(0, remaining);
            setPropertyVideos(prev => [...prev, ...newVideos]);
        }
    };

    const removePropertyVideo = (index: number) => {
        setPropertyVideos(prev => prev.filter((_, i) => i !== index));
    };

    const removeSavedVideo = async (url: string) => {
        setSavedVideos(prev => prev.filter(u => u !== url));
    };

    // ── AI Description Generation ──────────────────────────────────
    const generateMainDescription = async () => {
        setGeneratingMainDescription(true);
        try {
            const purpose = descriptionPurpose.venda && descriptionPurpose.aluguel ? 'both'
                : descriptionPurpose.venda ? 'venda' : 'aluguel';
            const res = await fetch('/api/property/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'main',
                    purpose,
                    propertyData: {
                        address: formData.propertyAddress,
                        totalSqMeters: propertyDetails.totalSqMeters,
                        solarEnergy: propertyDetails.solarEnergy,
                        solarKwp: propertyDetails.solarKwp,
                        propertyType,
                        numberOfUnits: propertyDetails.numberOfUnits,
                    },
                }),
            });
            const data = await res.json();
            if (data.description) {
                handleAddressChange('propertyAddress', 'description', data.description);
            } else {
                alert('Não foi possível gerar a descrição. Tente novamente.');
            }
        } catch {
            alert('Erro ao gerar descrição com IA.');
        } finally {
            setGeneratingMainDescription(false);
        }
    };

    const generateUnitDescription = async (unitIndex: number) => {
        setGeneratingUnitDescriptionIdx(unitIndex);
        try {
            const unit = subUnits[unitIndex];
            const res = await fetch('/api/property/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'unit',
                    unitData: {
                        name: unit.name,
                        sqMeters: unit.sqMeters,
                        rooms: unit.rooms,
                        bedrooms: unit.bedrooms,
                        bathrooms: unit.bathrooms,
                        garage: unit.garage,
                        kitchenCabinets: unit.kitchenCabinets,
                        laundry: unit.laundry,
                        ac: unit.ac,
                        cooktop: unit.cooktop,
                        condominium: unit.condominium,
                        condominiumValue: unit.condominiumValue,
                        condominiumIncludes: unit.condominiumIncludes,
                    },
                    propertyData: {
                        address: formData.propertyAddress,
                        totalSqMeters: propertyDetails.totalSqMeters,
                        propertyType,
                        numberOfUnits: propertyDetails.numberOfUnits,
                    },
                }),
            });
            const data = await res.json();
            if (data.description) {
                const updated = [...subUnits];
                updated[unitIndex] = { ...updated[unitIndex], description: data.description };
                setSubUnits(updated);
            } else {
                alert('Não foi possível gerar a descrição. Tente novamente.');
            }
        } catch {
            alert('Erro ao gerar descrição com IA.');
        } finally {
            setGeneratingUnitDescriptionIdx(null);
        }
    };

    // ── Contract Import ────────────────────────────────────────────
    const importContract = async (unitIndex: number, file: File) => {
        setImportingContractIdx(unitIndex);
        try {
            const formDataUpload = new FormData();
            formDataUpload.append('file', file);
            const res = await fetch('/api/property/extract-contract', {
                method: 'POST',
                body: formDataUpload,
            });
            const result = await res.json();
            if (result.success && result.data) {
                const d = result.data;
                const updated = [...subUnits];
                const unit = { ...updated[unitIndex] };
                if (d.name) unit.name = d.name;
                if (d.unitType) unit.unitType = d.unitType;
                if (d.sqMeters) unit.sqMeters = d.sqMeters;
                if (d.rooms) unit.rooms = d.rooms;
                if (d.bedrooms) unit.bedrooms = d.bedrooms;
                if (d.bathrooms) unit.bathrooms = d.bathrooms;
                if (d.garage !== undefined) unit.garage = d.garage;
                if (d.description) unit.description = d.description;
                if (d.condominium !== undefined) unit.condominium = d.condominium;
                if (d.condominiumValue) unit.condominiumValue = d.condominiumValue;
                if (d.condominiumIncludes) {
                    unit.condominiumIncludes = {
                        ...unit.condominiumIncludes,
                        ...d.condominiumIncludes,
                    };
                }
                updated[unitIndex] = unit;
                setSubUnits(updated);
                alert(`Dados extraídos com sucesso! Confira e ajuste os campos preenchidos.${d.tenantName ? '\nInquilino: ' + d.tenantName : ''}${d.startDate ? '\nInício: ' + d.startDate : ''}${d.endDate ? '\nTérmino: ' + d.endDate : ''}${d.rentValue ? '\nAluguel: R$ ' + d.rentValue : ''}`);
            } else {
                alert(result.error || 'Não foi possível extrair dados do contrato.');
            }
        } catch {
            alert('Erro ao processar contrato.');
        } finally {
            setImportingContractIdx(null);
        }
    };

    const analyzeDocument = async (file: File) => {
        setAnalyzingFiles(prev => {
            const next = new Set(prev);
            next.add(file.name);
            return next;
        });
        setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'analyzing' }));

        try {
            const fd = new FormData();
            fd.append('file', file);

            const res = await fetch('/api/ownership/analyze', {
                method: 'POST',
                body: fd
            });

            if (!res.ok) {
                console.error('[Ownership] API error', res.status);
                setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'error' }));
                return;
            }

            const data = await res.json();
            const result = data?.results?.[0];

            if (result?.success && result.extracted_data?.address) {
                const addr = result.extracted_data.address;
                // Auto-fill property address from extracted data
                setFormData(prev => ({
                    ...prev,
                    propertyAddress: {
                        ...prev.propertyAddress,
                        ...(addr.street ? { street: addr.street } : {}),
                        ...(addr.number ? { number: addr.number.replace(/^0+/, '') || addr.number } : {}),
                        ...(addr.neighborhood ? { neighborhood: addr.neighborhood } : {}),
                        ...(addr.city ? { city: addr.city } : {}),
                        ...(addr.state ? { state: addr.state } : {}),
                        ...(addr.cep ? { cep: addr.cep } : {}),
                    }
                }));

                const docType = result.classified_type || 'Documento';
                const method = result.extraction_method || 'unknown';
                const methodLabel = method === 'pdf_regex' ? 'Regex (sem IA 💰)'
                    : method === 'vision_gemini' ? 'Visão Gemini'
                        : method === 'vision_openai' ? 'Visão GPT'
                            : method;
                setExtractedAddressInfo(`✅ ${docType} — Endereço extraído com sucesso (${methodLabel})`);
                setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'success' }));
                // Auto-collapse verification section after successful extraction
                setOwnershipSectionOpen(false);
            } else {
                const methodsTried = result?.methods_tried?.join(' → ') || 'nenhum';
                setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'error' }));
                setExtractedAddressInfo(`⚠️ Não foi possível extrair endereço. Métodos tentados: ${methodsTried}`);
            }
        } catch (error) {
            console.error('[Ownership] Analysis failed', error);
            setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'error' }));
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
            // Auto-collapse identity section after successful extraction
            setIdentitySectionOpen(false);

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
                property_type: propertyType,
                property_details: propertyDetails,
                sub_units: subUnits,
                admin_data: personType === 'pj' ? adminData : null,
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

                    const { error: uploadError } = await sbUpload.storage
                        .from('documents')
                        .upload(fileName, file);

                    if (uploadError) {
                        console.error('Photo upload error:', uploadError);
                        continue;
                    }

                    const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                    updatedPhotoUrls.push(publicUrl);
                }
                setPropertyPhotos([]);
            }

            // 4. Upload Videos
            const updatedVideoUrls = [...savedVideos];
            if (propertyVideos.length > 0 && profile) {
                const sbUpload = await getSupabase();
                for (const file of propertyVideos) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `videos/${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

                    const { error: uploadError } = await sbUpload.storage
                        .from('documents')
                        .upload(fileName, file);

                    if (uploadError) {
                        console.error('Video upload error:', uploadError);
                        continue;
                    }

                    const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                    updatedVideoUrls.push(publicUrl);
                }
                setPropertyVideos([]);
            }

            // 5. Upload Sub-Unit Photos & Videos
            const updatedSubUnits = [...subUnits];
            if (profile) {
                const sbUpload = await getSupabase();
                for (let si = 0; si < updatedSubUnits.length; si++) {
                    const unit = updatedSubUnits[si];
                    // Upload new photos
                    if (unit.newPhotos && unit.newPhotos.length > 0) {
                        const unitPhotos = [...(unit.photos || [])];
                        for (const file of unit.newPhotos) {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `photos/${profile.id}/unit-${si}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const { error: uploadError } = await sbUpload.storage.from('documents').upload(fileName, file);
                            if (uploadError) { console.error('Unit photo upload error:', uploadError); continue; }
                            const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                            unitPhotos.push(publicUrl);
                        }
                        updatedSubUnits[si] = { ...unit, photos: unitPhotos, newPhotos: [] };
                    }
                    // Upload new videos
                    if (unit.newVideos && unit.newVideos.length > 0) {
                        const unitVideos = [...(unit.videos || [])];
                        for (const file of unit.newVideos) {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `videos/${profile.id}/unit-${si}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const { error: uploadError } = await sbUpload.storage.from('documents').upload(fileName, file);
                            if (uploadError) { console.error('Unit video upload error:', uploadError); continue; }
                            const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                            unitVideos.push(publicUrl);
                        }
                        updatedSubUnits[si] = { ...updatedSubUnits[si], videos: unitVideos, newVideos: [] };
                    }
                }
                setSubUnits(updatedSubUnits);
            }

            // Serialize sub-units for DB (strip File objects)
            const subUnitsForDB = updatedSubUnits.map(u => {
                const { newPhotos: _np, newVideos: _nv, ...rest } = u;
                return rest;
            });

            // Sync Photos/Videos/SubUnits to Profile
            if (profile) {
                await sb.from('profiles').update({
                    property_photos: updatedPhotoUrls,
                    property_videos: updatedVideoUrls,
                    sub_units: subUnitsForDB,
                }).eq('id', profile.id);
                setSavedPhotos(updatedPhotoUrls);
                setSavedVideos(updatedVideoUrls);
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

    // Calculate progress — counts ALL wizard steps
    const calculateProgress = () => {
        let completed = 0;
        let total = 0;

        // ── Ownership Tab Steps ──
        // 1. Documentation uploaded
        total++;
        if (savedProofs.length > 0 || ownershipFiles.length > 0) completed++;
        // 2. Address complete
        total++;
        if (formData.propertyAddress.cep && formData.propertyAddress.city && formData.propertyAddress.state) completed++;
        // 3. Details filled (propertyName + totalSqMeters)
        total++;
        if (propertyDetails.propertyName && propertyDetails.totalSqMeters) completed++;
        // 4. Photos uploaded (≥2 photos or ≥1 video)
        total++;
        const totalMainPhotos = savedPhotos.length + propertyPhotos.length;
        const totalMainVideos = savedVideos.length + propertyVideos.length;
        if (totalMainPhotos >= 2 || totalMainVideos >= 1) completed++;
        // 5. Description written
        total++;
        if (formData.propertyAddress.description?.trim()) completed++;
        // 6. Sub-units complete (multi only)
        if (propertyType === 'multi' && propertyDetails.numberOfUnits > 0) {
            total++;
            const allUnitsComplete = subUnits.length >= propertyDetails.numberOfUnits && subUnits.every(u => {
                const photos = (u.photos?.length || 0) + (u.newPhotos?.length || 0);
                return !!(u.unitType && u.name?.trim() && u.sqMeters?.trim() && u.rooms?.trim() && u.bedrooms?.trim() && u.bathrooms?.trim() && u.description?.trim() && photos >= 2);
            });
            if (allUnitsComplete) completed++;
        }

        // ── Basics Tab Steps ──
        // 7. Identity verified
        total++;
        if (personType === 'pf' ? formData.cpf : formData.cnpj) completed++;
        // 8. Personal/Business data
        total++;
        if (formData.name && formData.phone) completed++;
        // 9. Owner address
        total++;
        if (formData.ownerAddress.cep && formData.ownerAddress.city && formData.ownerAddress.state) completed++;
        // 10. Admin data (PJ only)
        if (personType === 'pj') {
            total++;
            if (adminData.name && adminData.email) completed++;
        }

        const isVerified = false;
        const rawPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
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

                        {/* Property Type Section: Add Property button or read-only badge */}
                        {!propertyCreated ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-4">
                                <div className="text-center space-y-2">
                                    <h3 className="text-lg font-semibold text-foreground">Nenhuma propriedade cadastrada</h3>
                                    <p className="text-sm text-muted-foreground max-w-md">Adicione uma propriedade para começar a preencher os dados do imóvel.</p>
                                </div>
                                <Button
                                    size="lg"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20 gap-2 px-8"
                                    onClick={() => setShowAddPropertyModal(true)}
                                >
                                    <Plus className="w-5 h-5" />
                                    Adicionar Propriedade
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                                    "bg-muted/60 text-foreground"
                                )}>
                                    {propertyType === 'single' ? <Home className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                                    {propertyType === 'single' ? 'Unifamiliar' : 'Multifamiliar'}
                                </div>
                                {propertyDetails.propertyName && (
                                    <span className="text-sm text-muted-foreground">— {propertyDetails.propertyName}</span>
                                )}
                            </div>
                        )}

                        {/* Wizard steps — only shown after property type is chosen */}
                        {propertyCreated && (<>

                            {/* 1. Documentation Section (ownership verification — first!) */}
                            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setOwnershipSectionOpen(prev => !prev)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-lg ${(extractedAddressInfo?.startsWith('✅') || (!ownershipSectionOpen && savedProofs.length > 0))
                                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600'
                                            : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600'
                                            }`}>
                                            {(extractedAddressInfo?.startsWith('✅') || (!ownershipSectionOpen && savedProofs.length > 0))
                                                ? <CheckCircle2 className="w-5 h-5" />
                                                : <FileText className="w-5 h-5" />}
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">{p.ownership.title}</h3>
                                        {!ownershipSectionOpen && (extractedAddressInfo?.startsWith('✅') || savedProofs.length > 0) && (
                                            <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Verificado ✓</span>
                                        )}
                                    </div>
                                    {ownershipSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                </button>

                                {ownershipSectionOpen && (
                                    <>
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border text-sm text-muted-foreground mb-4">
                                            <p className="font-medium text-foreground mb-2">{p.ownership.acceptedDocs}</p>
                                            <ul className="list-disc list-inside space-y-1 ml-1">
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
                                                {ownershipFiles.map((file, i) => {
                                                    const status = fileAnalysisStatus[file.name];
                                                    return (
                                                        <div key={`new-${i}`} className={`flex items-center justify-between p-3 rounded-lg border ${status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' :
                                                            status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                                                                'bg-muted/30 border-border'
                                                            }`}>
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border flex items-center justify-center flex-shrink-0">
                                                                    {status === 'analyzing' ? (
                                                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                                    ) : status === 'success' ? (
                                                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                                    ) : status === 'error' ? (
                                                                        <AlertTriangle className="w-5 h-5 text-red-500" />
                                                                    ) : (
                                                                        <FileText className="w-5 h-5 text-blue-500" />
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <p className="text-sm font-medium truncate pr-4">{file.name}</p>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {(file.size / 1024 / 1024).toFixed(2)} MB •{' '}
                                                                        {status === 'analyzing' ? (
                                                                            <span className="text-blue-600 dark:text-blue-400 font-medium">Analisando com IA...</span>
                                                                        ) : status === 'success' ? (
                                                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Endereço extraído ✓</span>
                                                                        ) : status === 'error' ? (
                                                                            <span className="text-red-600 dark:text-red-400 font-medium">Falha na extração</span>
                                                                        ) : (
                                                                            'Pronto para enviar'
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <Button variant="ghost" size="sm" onClick={() => removeFile(i)} className="text-destructive">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
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
                                        {/* Continuar button for Documentation → Address */}
                                        {(savedProofs.length > 0 || ownershipFiles.length > 0) && (
                                            <div className="flex justify-end pt-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                    onClick={() => { setOwnershipSectionOpen(false); setAddressSectionOpen(true); }}
                                                >
                                                    Continuar <ArrowRight className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Extraction feedback banner */}
                            {extractedAddressInfo && (
                                <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${extractedAddressInfo.startsWith('✅')
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                                    }`}>
                                    {extractedAddressInfo.startsWith('✅')
                                        ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                                        : <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                    }
                                    <span>{extractedAddressInfo}</span>
                                </div>
                            )}

                            {/* 2. Address Section — Collapsible */}
                            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setAddressSectionOpen(prev => !prev)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg text-emerald-600">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">{p.basics.addressTitle}</h3>
                                        {!addressSectionOpen && formData.propertyAddress.street && (
                                            <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                        )}
                                    </div>
                                    {addressSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                </button>

                                {addressSectionOpen && (
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
                                )}

                                {/* Continuar button for Address → Details */}
                                {addressSectionOpen && formData.propertyAddress.cep && formData.propertyAddress.city && (
                                    <div className="flex justify-end pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                            onClick={() => { setAddressSectionOpen(false); setDetailsInitialOpen(true); }}
                                        >
                                            Continuar <ArrowRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* 3. Detalhes Section */}
                            <PropertyDetailsCard
                                key={`details-${detailsInitialOpen}`}
                                details={propertyDetails}
                                units={subUnits}
                                onDetailsChange={setPropertyDetails}
                                onUnitsChange={setSubUnits}
                                propertyType={propertyType}
                                initialOpen={detailsInitialOpen}
                            />
                            {/* Continuar button for Details → Photos */}
                            {detailsInitialOpen && propertyDetails.propertyName && propertyDetails.totalSqMeters && (
                                <div className="flex justify-end -mt-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                        onClick={() => { setDetailsInitialOpen(false); setPhotosSectionOpen(true); }}
                                    >
                                        Continuar <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}

                            {/* 4. Photos & Videos Section — Main Property — Collapsible */}
                            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setPhotosSectionOpen(prev => !prev)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600">
                                            <Camera className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">Fotos e Vídeos do Imóvel</h3>
                                        {!photosSectionOpen && (savedPhotos.length > 0 || propertyPhotos.length > 0 || savedVideos.length > 0 || propertyVideos.length > 0) && (
                                            <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                                {savedPhotos.length + propertyPhotos.length} fotos · {savedVideos.length + propertyVideos.length} vídeos
                                            </span>
                                        )}
                                    </div>
                                    {photosSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                </button>

                                {photosSectionOpen && (
                                    <>
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border flex gap-3 items-start">
                                            <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-foreground mb-1">Dica Profissional</p>
                                                <p className="text-sm text-muted-foreground">Imóveis com pelo menos 5 fotos recebem 4x mais visualizações! Capriche na iluminação. Essas mídias são da <strong>propriedade principal</strong> (área comum e fachada).</p>
                                            </div>
                                        </div>

                                        {/* Photos (up to 10) */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                                    <Camera className="w-4 h-4 text-muted-foreground" />
                                                    Fotos
                                                </p>
                                                <span className="text-xs text-muted-foreground">{savedPhotos.length + propertyPhotos.length}/10</span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                {/* Upload Button */}
                                                {savedPhotos.length + propertyPhotos.length < 10 && (
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
                                                )}

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

                                        {/* Videos (up to 2) */}
                                        <div className="space-y-2 pt-3 border-t border-border">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                                    <Video className="w-4 h-4 text-muted-foreground" />
                                                    Vídeos
                                                </p>
                                                <span className="text-xs text-muted-foreground">{savedVideos.length + propertyVideos.length}/2</span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                {savedVideos.length + propertyVideos.length < 2 && (
                                                    <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                                        <input
                                                            type="file"
                                                            accept="video/*"
                                                            onChange={handleVideoSelect}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        />
                                                        <Video className="w-8 h-8 text-muted-foreground mb-2" />
                                                        <span className="text-xs text-muted-foreground">Adicionar Vídeo</span>
                                                    </div>
                                                )}

                                                {/* New Videos */}
                                                {propertyVideos.map((file, idx) => (
                                                    <div key={`new-v-${idx}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden bg-muted">
                                                        <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" muted />
                                                        <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removePropertyVideo(idx)}>
                                                                <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 text-center flex items-center justify-center gap-1">
                                                            <Video className="w-3 h-3" /> {file.name}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Saved Videos */}
                                                {savedVideos.map((url, idx) => (
                                                    <div key={`saved-v-${idx}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden">
                                                        <video src={url} className="w-full h-full object-cover" muted />
                                                        <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removeSavedVideo(url)}>
                                                                <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 text-center flex items-center justify-center gap-1">
                                                            <Video className="w-3 h-3" /> Vídeo
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 5. Description Section — Main Property — Collapsible */}
                            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setDescriptionSectionOpen(prev => !prev)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">Descrição do Imóvel</h3>
                                        {!descriptionSectionOpen && formData.propertyAddress.description && (
                                            <span className="ml-2 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                        )}
                                    </div>
                                    {descriptionSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                </button>
                                {descriptionSectionOpen && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label>Descreva seu imóvel em detalhes <span className="text-red-500">*</span></Label>
                                        </div>
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <span className="text-sm font-medium text-foreground">Finalidade da descrição:</span>
                                            <DetailCheckbox
                                                checked={descriptionPurpose.aluguel}
                                                onChange={(val) => setDescriptionPurpose(prev => ({ ...prev, aluguel: val }))}
                                                label="Aluguel"
                                            />
                                            <DetailCheckbox
                                                checked={descriptionPurpose.venda}
                                                onChange={(val) => setDescriptionPurpose(prev => ({ ...prev, venda: val }))}
                                                label="Venda"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs gap-1 text-violet-600 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 ml-auto"
                                                onClick={generateMainDescription}
                                                disabled={generatingMainDescription || (!descriptionPurpose.venda && !descriptionPurpose.aluguel)}
                                            >
                                                {generatingMainDescription ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-3.5 h-3.5" />
                                                )}
                                                {generatingMainDescription ? 'Gerando...' : 'Gerar com IA'}
                                            </Button>
                                        </div>
                                        <textarea
                                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]"
                                            placeholder="Ex: Excelente apartamento com varanda gourmet, vista livre, armários planejados na cozinha e banheiros..."
                                            value={formData.propertyAddress.description || ''}
                                            onChange={(e) => handleAddressChange('propertyAddress', 'description', e.target.value)}
                                        />
                                        <span className="text-xs text-muted-foreground">Esta descrição será exibida no anúncio do imóvel principal.</span>
                                    </div>
                                )}

                                {/* Continuar button for Description → Sub-units (or save) */}
                                {descriptionSectionOpen && formData.propertyAddress.description?.trim() && (
                                    <div className="flex justify-end pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                            onClick={() => {
                                                setDescriptionSectionOpen(false);
                                                // If multi with units, the sub-units section shows itself
                                                // Otherwise, navigate to Basics tab
                                                if (propertyType !== 'multi' || propertyDetails.numberOfUnits === 0) {
                                                    handleSave();
                                                    setActiveTab('basics');
                                                }
                                            }}
                                        >
                                            {propertyType === 'multi' && propertyDetails.numberOfUnits > 0
                                                ? <>Continuar <ArrowRight className="w-4 h-4" /></>
                                                : <>Salvar e Continuar <ArrowRight className="w-4 h-4" /></>}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* 6. Sub-unidades Section (at the bottom, only for multi) */}
                            {propertyType === 'multi' && propertyDetails.numberOfUnits > 0 && (
                                <SubUnitsSection
                                    details={propertyDetails}
                                    units={subUnits}
                                    onDetailsChange={setPropertyDetails}
                                    onUnitsChange={setSubUnits}
                                    onGenerateDescription={generateUnitDescription}
                                    generatingDescriptionIdx={generatingUnitDescriptionIdx}
                                    onImportContract={importContract}
                                    importingContractIdx={importingContractIdx}
                                />
                            )}

                        </>)}{/* end propertyCreated guard */}

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

                        {/* PF/PJ Toggle — Single source of truth at the top */}
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

                        {/* IDENTITY VERIFICATION — Collapsible */}
                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                            <button
                                type="button"
                                onClick={() => setIdentitySectionOpen(prev => !prev)}
                                className="flex items-center justify-between w-full"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${(identityResult?.success || (!identitySectionOpen && (formData.cpf || formData.cnpj)))
                                        ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600'
                                        : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600'
                                        }`}>
                                        {(identityResult?.success || (!identitySectionOpen && (formData.cpf || formData.cnpj)))
                                            ? <CheckCircle2 className="w-5 h-5" />
                                            : <Fingerprint className="w-5 h-5" />}
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground">Verificação de Identidade</h3>
                                    {!identitySectionOpen && (identityResult?.success || formData.cpf || formData.cnpj) && (
                                        <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Verificado ✓</span>
                                    )}
                                </div>
                                {identitySectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                            </button>

                            {identitySectionOpen && (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        {personType === 'pf'
                                            ? 'Envie uma foto ou scan do seu documento de identidade (CNH ou RG). Os dados serão preenchidos automaticamente.'
                                            : 'Envie o Comprovante de Inscrição e de Situação Cadastral do CNPJ (PDF disponível em gov.br). Os dados serão preenchidos automaticamente.'}
                                    </p>

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
                                </>
                            )}
                        </div>

                        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
                            <button
                                type="button"
                                onClick={() => setHoldingSectionOpen(prev => !prev)}
                                className="flex items-center justify-between w-full"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${(!holdingSectionOpen && formData.name && formData.phone)
                                        ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600'
                                        : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600'
                                        }`}>
                                        {(!holdingSectionOpen && formData.name && formData.phone)
                                            ? <CheckCircle2 className="w-5 h-5" />
                                            : <User className="w-5 h-5" />}
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground">
                                        {personType === 'pj' ? 'Dados da Holding Imobiliária' : 'Dados do Proprietário'}
                                    </h3>
                                    {!holdingSectionOpen && formData.name && formData.phone && (
                                        <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                    )}
                                </div>
                                {holdingSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                            </button>

                            {holdingSectionOpen && (<>

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

                            </>)}
                        </div>

                        {/* ADMIN DATA CARD — Only for PJ */}
                        {personType === 'pj' && (
                            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
                                <button
                                    type="button"
                                    onClick={() => setAdminSectionOpen(prev => !prev)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-lg ${(!adminSectionOpen && adminData.name && adminData.email)
                                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600'
                                            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-600'
                                            }`}>
                                            {(!adminSectionOpen && adminData.name && adminData.email)
                                                ? <CheckCircle2 className="w-5 h-5" />
                                                : <User className="w-5 h-5" />}
                                        </div>
                                        <h3 className="text-lg font-semibold text-foreground">Dados do Administrador</h3>
                                        {!adminSectionOpen && adminData.name && adminData.email && (
                                            <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                        )}
                                    </div>
                                    {adminSectionOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                </button>
                                {adminSectionOpen && (<>
                                    <p className="text-sm text-muted-foreground">
                                        Pessoa responsável pela gestão da holding imobiliária.
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Nome Completo</Label>
                                            <Input
                                                value={adminData.name}
                                                onChange={(e) => setAdminData(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="Nome do administrador"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Email</Label>
                                            <Input
                                                type="email"
                                                value={adminData.email}
                                                onChange={(e) => setAdminData(prev => ({ ...prev, email: e.target.value }))}
                                                placeholder="admin@empresa.com"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-foreground">Telefone / WhatsApp</Label>
                                            <Input
                                                value={adminData.phone}
                                                onChange={(e) => setAdminData(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                                                placeholder="(00) 00000-0000"
                                            />
                                        </div>
                                    </div>

                                    {/* Admin Address with CEP auto-fetch */}
                                    <div className="pt-4 border-t border-border">
                                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-amber-600" />
                                            Endereço do Administrador
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="space-y-2">
                                                <Label>CEP</Label>
                                                <div className="relative">
                                                    <Input
                                                        value={adminData.address.cep}
                                                        onChange={(e) => handleAddressChange('adminAddress', 'cep', e.target.value)}
                                                        placeholder="00000-000"
                                                        maxLength={9}
                                                    />
                                                    {isLoadingAddress && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
                                                </div>
                                            </div>
                                            <div className="md:col-span-3 space-y-2">
                                                <Label>Cidade / UF</Label>
                                                <div className="flex gap-2">
                                                    <Input value={adminData.address.city} readOnly className="bg-muted/50" placeholder="Cidade" />
                                                    <Input value={adminData.address.state} readOnly className="bg-muted/50 w-20" placeholder="UF" />
                                                </div>
                                            </div>
                                            <div className="md:col-span-3 space-y-2">
                                                <Label>Rua / Logradouro</Label>
                                                <Input value={adminData.address.street} readOnly className="bg-muted/50" placeholder="Preenchido automaticamente pelo CEP" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Número</Label>
                                                <Input
                                                    value={adminData.address.number}
                                                    onChange={(e) => handleAddressChange('adminAddress', 'number', e.target.value)}
                                                    placeholder="123"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <Label>Bairro</Label>
                                                <Input value={adminData.address.neighborhood} readOnly className="bg-muted/50" placeholder="Preenchido pelo CEP" />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <Label>Complemento</Label>
                                                <Input
                                                    value={adminData.address.complement}
                                                    onChange={(e) => handleAddressChange('adminAddress', 'complement', e.target.value)}
                                                    placeholder="Sala 101"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>)}
                            </div>
                        )}

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

            {/* Add Property Modal */}
            {showAddPropertyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-background rounded-xl p-8 max-w-lg w-full space-y-6 shadow-2xl border border-border animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-foreground">Adicionar Propriedade</h3>
                            <p className="text-sm text-muted-foreground">Selecione o tipo de propriedade que deseja cadastrar.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setPropertyType('single');
                                    setPropertyCreated(true);
                                    setOwnershipSectionOpen(true);
                                    setShowAddPropertyModal(false);
                                }}
                                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-all duration-200 text-center"
                            >
                                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-xl text-emerald-600 group-hover:scale-110 transition-transform">
                                    <Home className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">Unifamiliar</p>
                                    <p className="text-xs text-muted-foreground mt-1">Casa, apartamento ou terreno</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPropertyType('multi');
                                    setPropertyCreated(true);
                                    setOwnershipSectionOpen(true);
                                    setShowAddPropertyModal(false);
                                }}
                                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-all duration-200 text-center"
                            >
                                <div className="p-3 bg-violet-100 dark:bg-violet-900/50 rounded-xl text-violet-600 group-hover:scale-110 transition-transform">
                                    <Building2 className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">Multifamiliar</p>
                                    <p className="text-xs text-muted-foreground mt-1">Prédio, vila ou condomínio</p>
                                </div>
                            </button>
                        </div>
                        <div className="flex justify-center">
                            <Button variant="ghost" size="sm" onClick={() => setShowAddPropertyModal(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
