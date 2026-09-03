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
import { useSearchParams } from 'next/navigation';
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

// Per-property bundled state
interface PropertyState {
    propertyType: 'single' | 'multi';
    details: PropertyDetails;
    subUnits: SubUnit[];
    address: {
        cep: string;
        street: string;
        number: string;
        city: string;
        state: string;
        neighborhood: string;
        complement: string;
        description: string;
    };
    photos: File[];        // new photos pending upload
    savedPhotos: string[]; // already-uploaded URLs
    videos: File[];        // new videos pending upload
    savedVideos: string[]; // already-uploaded URLs
    ownershipFiles: File[]; // new proof files
    savedProofs: ProofData[];
    profilePhotoUrl: string | null; // main profile photo URL for collapsed card
    // collapsible section states
    ownershipSectionOpen: boolean;
    addressSectionOpen: boolean;
    photosSectionOpen: boolean;
    descriptionSectionOpen: boolean;
    detailsInitialOpen: boolean;
    subUnitOpenIdx: number | null;
}

type ProfileView = 'proprietario' | 'imoveis' | 'full';

interface ProfileContentProps {
    dict: Dictionary;
    view?: ProfileView;
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

export default function ProfileContent({ dict, view = 'full' }: ProfileContentProps) {
    const { isLoaded, user } = useUser();
    const p = dict.profile;
    const { getToken } = useAuth();

    // Determine initial tab based on view
    const initialTab = view === 'proprietario' ? 'basics' : view === 'imoveis' ? 'ownership' : 'ownership';
    const [activeTab, setActiveTab] = useState<'basics' | 'ownership' | 'security'>(initialTab);

    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingAddress, setIsLoadingAddress] = useState(false);
    const [cepError, setCepError] = useState("");
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

    // Success State
    const [showSuccess, setShowSuccess] = useState(false);

    // Data state (ownershipFiles, propertyPhotos, savedProofs, savedPhotos are now derived from properties[0])
    const [profileId, setProfileId] = useState<string | null>(null);

    // Identity verification state
    const [identityFile, setIdentityFile] = useState<File | null>(null);
    const [isAnalyzingIdentity, setIsAnalyzingIdentity] = useState(false);
    const [identityResult, setIdentityResult] = useState<Record<string, unknown> | null>(null);
    const [identityError, setIdentityError] = useState<string | null>(null);

    // Person type toggle: 'pf' = Pessoa Física, 'pj' = Pessoa Jurídica
    const [personType, setPersonType] = useState<'pf' | 'pj'>('pf');

    // Tabs (after personType so we can use it for dynamic labels)
    // NOTE: ownership tab label is set below after `properties` state is defined

    // Property type: single-family or multi-family
    const [propertyType, setPropertyType] = useState<'single' | 'multi'>('single');

    // ── Multi-Property State ──
    const emptyPropertyAddress = () => ({
        cep: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '', description: ''
    });
    const emptyPropertyDetails = (): PropertyDetails => ({
        propertyName: '', cadastroImobiliario: '', inscricaoImobiliaria: '', matricula: '',
        areaLote: '', areaEdificada: '', numberOfUnits: 0, totalSqMeters: '',
        solarEnergy: false, solarKwp: '', mainMeters: { water: false, energy: false, gas: false }, internetBill: false,
    });
    const createEmptyProperty = (type: 'single' | 'multi'): PropertyState => ({
        propertyType: type,
        details: emptyPropertyDetails(),
        subUnits: [],
        address: emptyPropertyAddress(),
        photos: [], savedPhotos: [],
        videos: [], savedVideos: [],
        ownershipFiles: [], savedProofs: [],
        profilePhotoUrl: null,
        ownershipSectionOpen: true,
        addressSectionOpen: true,
        photosSectionOpen: true,
        descriptionSectionOpen: true,
        detailsInitialOpen: true,
        subUnitOpenIdx: null,
    });

    const [properties, setProperties] = useState<PropertyState[]>([]);
    const [expandedPropertyIdx, setExpandedPropertyIdx] = useState<number | null>(null);

    // Helper: check if a property has all mandatory fields filled
    const isPropertyComplete = (prop: PropertyState): boolean => {
        const hasAddress = !!(prop.address.cep && prop.address.city && prop.address.state);
        const hasDetails = !!(prop.details.propertyName && prop.details.totalSqMeters);
        const hasPhotos = (prop.savedPhotos.length + prop.photos.length) >= 2 || (prop.savedVideos.length + prop.videos.length) >= 1;
        const hasDescription = !!prop.address.description?.trim();
        const hasDocs = prop.savedProofs.length > 0 || prop.ownershipFiles.length > 0;
        return hasAddress && hasDetails && hasPhotos && hasDescription && hasDocs;
    };

    // Helper: update a single property in the array
    const updateProperty = (idx: number, updater: (prev: PropertyState) => PropertyState) => {
        setProperties(prev => prev.map((p, i) => i === idx ? updater(p) : p));
    };

    // Legacy single-property aliases (used by save function & existing code)
    const propertyDetails = properties[0]?.details ?? emptyPropertyDetails();
    const subUnits = properties[0]?.subUnits ?? [];
    const propertyPhotos = properties[0]?.photos ?? [];
    const savedPhotos = properties[0]?.savedPhotos ?? [];
    const propertyVideos = properties[0]?.videos ?? [];
    const savedVideos = properties[0]?.savedVideos ?? [];
    const ownershipFiles = properties[0]?.ownershipFiles ?? [];
    const savedProofs = properties[0]?.savedProofs ?? [];

    // Property details & sub-units — legacy setters that update properties[0]
    const setPropertyDetails = (val: PropertyDetails | ((prev: PropertyDetails) => PropertyDetails)) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newDetails = typeof val === 'function' ? val(prev[0].details) : val;
            return prev.map((p, i) => i === 0 ? { ...p, details: newDetails } : p);
        });
    };
    const setSubUnits = (val: SubUnit[] | ((prev: SubUnit[]) => SubUnit[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newUnits = typeof val === 'function' ? val(prev[0].subUnits) : val;
            return prev.map((p, i) => i === 0 ? { ...p, subUnits: newUnits } : p);
        });
    };
    const setPropertyPhotos = (val: File[] | ((prev: File[]) => File[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].photos) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, photos: newVal } : p2);
        });
    };
    const setSavedPhotos = (val: string[] | ((prev: string[]) => string[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].savedPhotos) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, savedPhotos: newVal } : p2);
        });
    };
    const setPropertyVideos = (val: File[] | ((prev: File[]) => File[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].videos) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, videos: newVal } : p2);
        });
    };
    const setSavedVideos = (val: string[] | ((prev: string[]) => string[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].savedVideos) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, savedVideos: newVal } : p2);
        });
    };
    const setOwnershipFiles = (val: File[] | ((prev: File[]) => File[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].ownershipFiles) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, ownershipFiles: newVal } : p2);
        });
    };
    const setSavedProofs = (val: ProofData[] | ((prev: ProofData[]) => ProofData[])) => {
        setProperties(prev => {
            if (prev.length === 0) return prev;
            const newVal = typeof val === 'function' ? val(prev[0].savedProofs) : val;
            return prev.map((p2, i) => i === 0 ? { ...p2, savedProofs: newVal } : p2);
        });
    };


    // Add Property modal + wizard
    const MAX_PROPERTIES = 30;
    const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);

    // Auto-open add property modal when ?add=true is in the URL (from dashboard "Novo Imóvel" button)
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get('add') === 'true') {
            setActiveTab('ownership');
            // Small delay to let the tab switch render, then show modal
            setTimeout(() => setShowAddPropertyModal(true), 100);
        }
    }, [searchParams]);
    const propertyCreated = properties.length > 0;

    // Dynamic tab labels
    const ownershipTabLabel = properties.length > 1 ? 'Dados das Propriedades' : p.tabs.ownership;
    const allTabs = [
        { id: 'ownership', label: ownershipTabLabel },
        { id: 'basics', label: personType === 'pj' ? 'Dados da Holding' : p.tabs.basics },
        { id: 'security', label: properties.length > 1 ? 'Gerenciar Propriedades' : p.tabs.security },
    ];

    // Filter tabs based on view prop
    const tabs = view === 'proprietario'
        ? allTabs.filter(t => t.id === 'basics')
        : view === 'imoveis'
            ? allTabs.filter(t => t.id === 'ownership' || t.id === 'security')
            : allTabs;

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

                    // ── Build properties array from DB ──
                    const loadedProofs: ProofData[] = [];
                    {
                        const { data: proofs } = await sb
                            .from('ownership_proofs')
                            .select('*')
                            .eq('profile_id', profile.id)
                            .order('created_at', { ascending: false });
                        if (proofs) loadedProofs.push(...(proofs as ProofData[]));
                    }

                    const primaryPropAddr = profile.property_address || emptyPropertyAddress();
                    const primaryPropDetails = profile.property_details as PropertyDetails | null;
                    const primaryPhotos = Array.isArray(profile.property_photos) ? profile.property_photos as string[] : [];
                    const primaryVideos = Array.isArray(profile.property_videos) ? profile.property_videos as string[] : [];
                    const primarySubUnits = Array.isArray(profile.sub_units) ? profile.sub_units as SubUnit[] : [];

                    const primaryProfilePhoto = (profile.profile_photo_url as string) || null;
                    const primaryProperty: PropertyState = {
                        propertyType: (profile.property_type as 'single' | 'multi') || 'single',
                        details: primaryPropDetails ? {
                            propertyName: primaryPropDetails.propertyName || '',
                            cadastroImobiliario: primaryPropDetails.cadastroImobiliario || '',
                            inscricaoImobiliaria: primaryPropDetails.inscricaoImobiliaria || '',
                            matricula: primaryPropDetails.matricula || '',
                            areaLote: primaryPropDetails.areaLote || '',
                            areaEdificada: primaryPropDetails.areaEdificada || '',
                            numberOfUnits: primaryPropDetails.numberOfUnits || 0,
                            totalSqMeters: primaryPropDetails.totalSqMeters || '',
                            solarEnergy: primaryPropDetails.solarEnergy || false,
                            solarKwp: primaryPropDetails.solarKwp || '',
                            mainMeters: primaryPropDetails.mainMeters || { water: false, energy: false, gas: false },
                            internetBill: primaryPropDetails.internetBill || false,
                        } : emptyPropertyDetails(),
                        subUnits: primarySubUnits,
                        address: primaryPropAddr,
                        photos: [],
                        savedPhotos: primaryPhotos,
                        videos: [],
                        savedVideos: primaryVideos,
                        ownershipFiles: [],
                        savedProofs: loadedProofs,
                        profilePhotoUrl: primaryProfilePhoto,
                        // Collapse filled sections
                        ownershipSectionOpen: loadedProofs.length === 0,
                        addressSectionOpen: !primaryPropAddr.street,
                        photosSectionOpen: primaryPhotos.length < 2,
                        descriptionSectionOpen: !primaryPropAddr.description,
                        detailsInitialOpen: !primaryPropDetails?.totalSqMeters,
                        subUnitOpenIdx: null,
                    };

                    // Load additional properties from JSON column
                    const additionalProps: PropertyState[] = [];
                    if (profile.additional_properties && Array.isArray(profile.additional_properties)) {
                        for (const ap of profile.additional_properties) {
                            const apTyped = ap as Record<string, unknown>;
                            additionalProps.push({
                                propertyType: (apTyped.propertyType as 'single' | 'multi') || 'single',
                                details: (apTyped.details as PropertyDetails) || emptyPropertyDetails(),
                                subUnits: Array.isArray(apTyped.subUnits) ? apTyped.subUnits as SubUnit[] : [],
                                address: (apTyped.address as PropertyState['address']) || emptyPropertyAddress(),
                                photos: [],
                                savedPhotos: Array.isArray(apTyped.savedPhotos) ? apTyped.savedPhotos as string[] : [],
                                videos: [],
                                savedVideos: Array.isArray(apTyped.savedVideos) ? apTyped.savedVideos as string[] : [],
                                ownershipFiles: [],
                                savedProofs: Array.isArray(apTyped.savedProofs) ? apTyped.savedProofs as ProofData[] : [],
                                profilePhotoUrl: (apTyped.profilePhotoUrl as string) || null,
                                ownershipSectionOpen: !(Array.isArray(apTyped.savedProofs) && (apTyped.savedProofs as ProofData[]).length > 0),
                                addressSectionOpen: true,
                                photosSectionOpen: true,
                                descriptionSectionOpen: true,
                                detailsInitialOpen: true,
                                subUnitOpenIdx: null,
                            });
                        }
                    }

                    // Only set properties if we actually have a property_type saved
                    if (profile.property_type) {
                        const allProps = [primaryProperty, ...additionalProps];
                        setProperties(allProps);

                        // Decide which to expand
                        // All collapsed if ALL are complete, else expand first incomplete
                        const allComplete = allProps.every(isPropertyComplete);
                        if (allComplete) {
                            setExpandedPropertyIdx(null);
                        } else {
                            const firstIncomplete = allProps.findIndex(p2 => !isPropertyComplete(p2));
                            setExpandedPropertyIdx(firstIncomplete >= 0 ? firstIncomplete : 0);
                        }
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
        } else if (type === 'propertyAddress') {
            // Route to properties[0].address
            updateProperty(0, prop => ({
                ...prop,
                address: { ...prop.address, [field]: formattedValue }
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
            } else if (type === 'propertyAddress') {
                // Route to properties[0].address
                updateProperty(0, prop => ({
                    ...prop,
                    address: {
                        ...prop.address,
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
        } catch (_err) {
            setCepError(p.basics.cepError);
        } finally {
            setIsLoadingAddress(false);
        }
    };

    const [analyzingFiles, setAnalyzingFiles] = useState<Set<string>>(new Set());
    const [extractedAddressInfo, setExtractedAddressInfo] = useState<string | null>(null);
    const [fileAnalysisStatus, setFileAnalysisStatus] = useState<Record<string, 'analyzing' | 'success' | 'error'>>({});
    const [identitySectionOpen, setIdentitySectionOpen] = useState(true);

    // ── AI Description Generation ──────────────────────────────────
    const generateMainDescription = async (propIdx: number) => {
        setGeneratingMainDescription(true);
        try {
            const prop = properties[propIdx];
            if (!prop) return;
            const purpose = descriptionPurpose.venda && descriptionPurpose.aluguel ? 'both'
                : descriptionPurpose.venda ? 'venda' : 'aluguel';
            const res = await fetch('/api/property/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'main',
                    purpose,
                    propertyData: {
                        address: prop.address,
                        totalSqMeters: prop.details.totalSqMeters,
                        solarEnergy: prop.details.solarEnergy,
                        solarKwp: prop.details.solarKwp,
                        propertyType: prop.propertyType,
                        numberOfUnits: prop.details.numberOfUnits,
                    },
                }),
            });
            const data = await res.json();
            if (data.description) {
                updateProperty(propIdx, prev => ({ ...prev, address: { ...prev.address, description: data.description } }));
            } else {
                alert('Não foi possível gerar a descrição. Tente novamente.');
            }
        } catch {
            alert('Erro ao gerar descrição com IA.');
        } finally {
            setGeneratingMainDescription(false);
        }
    };

    const generateUnitDescription = async (propIdx: number, unitIndex: number) => {
        setGeneratingUnitDescriptionIdx(unitIndex);
        try {
            const prop = properties[propIdx];
            if (!prop) return;
            const unit = prop.subUnits[unitIndex];
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
                        address: prop.address,
                        totalSqMeters: prop.details.totalSqMeters,
                        propertyType: prop.propertyType,
                        numberOfUnits: prop.details.numberOfUnits,
                    },
                }),
            });
            const data = await res.json();
            if (data.description) {
                updateProperty(propIdx, prev => {
                    const updated = [...prev.subUnits];
                    updated[unitIndex] = { ...updated[unitIndex], description: data.description };
                    return { ...prev, subUnits: updated };
                });
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
    const importContract = async (propIdx: number, unitIndex: number, file: File) => {
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
                updateProperty(propIdx, prev => {
                    const updated = [...prev.subUnits];
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
                    return { ...prev, subUnits: updated };
                });
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
            let uploadFile = file;

            // If PDF, convert first page to PNG in the browser for reliable Vision AI
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                try {
                    const pdfjsLib = await import('pdfjs-dist');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
                    const page = await pdf.getPage(1);

                    const scale = 2; // High-res for accurate OCR
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas context not available');

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

                    const blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob(
                            (b) => (b ? resolve(b) : reject(new Error('Failed to convert PDF to image'))),
                            'image/png'
                        );
                    });

                    uploadFile = new File([blob], file.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' });
                    console.log('[Ownership] PDF converted to PNG for Vision AI');
                } catch (pdfConvertErr) {
                    console.warn('[Ownership] PDF→PNG conversion failed, sending raw file:', pdfConvertErr);
                    // Fall through: send the original PDF, the API will try regex + vision on raw bytes
                }
            }

            const fd = new FormData();
            fd.append('file', uploadFile);

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
                const propIdx = expandedPropertyIdx ?? 0;

                // Auto-fill per-property address from extracted data
                updateProperty(propIdx, prev => ({
                    ...prev,
                    address: {
                        ...prev.address,
                        ...(addr.street ? { street: addr.street } : {}),
                        ...(addr.number ? { number: String(addr.number).replace(/^0+/, '') || addr.number } : {}),
                        ...(addr.neighborhood ? { neighborhood: addr.neighborhood } : {}),
                        ...(addr.city ? { city: addr.city } : {}),
                        ...(addr.state ? { state: addr.state } : {}),
                        ...(addr.cep ? { cep: addr.cep } : {}),
                    }
                }));

                // Auto-fill IPTU-specific property details if present
                const iptu = result.extracted_data.iptu_data;
                if (iptu) {
                    updateProperty(propIdx, prev => ({
                        ...prev,
                        details: {
                            ...prev.details,
                            ...(iptu.cadastro_imobiliario ? { cadastroImobiliario: iptu.cadastro_imobiliario } : {}),
                            ...(iptu.inscricao_imobiliaria ? { inscricaoImobiliaria: iptu.inscricao_imobiliaria } : {}),
                            ...(iptu.matricula ? { matricula: iptu.matricula } : {}),
                            ...(iptu.area_lote ? { areaLote: iptu.area_lote } : {}),
                            ...(iptu.area_edificada ? { areaEdificada: iptu.area_edificada } : {}),
                        }
                    }));
                }

                const docType = result.classified_type || 'Documento';
                const method = result.extraction_method || 'unknown';
                const methodLabel = method === 'pdf_regex' ? 'Regex (sem IA 💰)'
                    : method === 'vision_gemini' ? 'Visão Gemini'
                        : method === 'vision_openai' ? 'Visão GPT'
                            : method;
                setExtractedAddressInfo(`✅ ${docType} — Endereço extraído com sucesso (${methodLabel})`);
                setFileAnalysisStatus(prev => ({ ...prev, [file.name]: 'success' }));
                // Auto-collapse verification section after successful extraction
                updateProperty(propIdx, prev => ({ ...prev, ownershipSectionOpen: false }));
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

    const handleSave = async (silent = false, propertiesOverride?: PropertyState[]) => {
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

            // Use override if provided (e.g. after deletion), otherwise use current state
            const props = propertiesOverride ?? properties;

            // 1. Upsert Profile

            const profilePayload: Record<string, unknown> = {
                clerk_id: user.id,
                full_name: formData.name,
                email: user.primaryEmailAddress?.emailAddress,
                phone: formData.phone,
                person_type: personType,
                address: formData.ownerAddress,
                // When all properties are deleted, null out legacy columns to prevent ghost properties
                property_address: props.length > 0 ? props[0].address : null,
                property_type: props.length > 0 ? props[0].propertyType : null,
                property_details: props.length > 0 ? props[0].details : null,
                sub_units: props.length > 0 ? props[0].subUnits : null,
                property_photos: props.length > 0 ? props[0].savedPhotos : null,
                property_videos: props.length > 0 ? props[0].savedVideos : null,
                profile_photo_url: props.length > 0 ? props[0].profilePhotoUrl : null,
                admin_data: personType === 'pj' ? adminData : null,
                role: 'landlord',
                // Persist additional properties (index 1+) as JSON
                additional_properties: props.slice(1).map(prop => ({
                    propertyType: prop.propertyType,
                    details: prop.details,
                    subUnits: prop.subUnits,
                    address: prop.address,
                    savedPhotos: prop.savedPhotos,
                    savedVideos: prop.savedVideos,
                    savedProofs: prop.savedProofs,
                    profilePhotoUrl: prop.profilePhotoUrl,
                })),
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

            // ── Upload files for ALL properties ──────────────────────────
            if (profile) {
                const sbUpload = await getSupabase();
                const updatedProperties = [...properties];

                for (let propIdx = 0; propIdx < updatedProperties.length; propIdx++) {
                    const prop = updatedProperties[propIdx];
                    const propStoragePrefix = propIdx === 0 ? profile.id : `${profile.id}/prop-${propIdx}`;

                    // 2. Upload Ownership Proof Files
                    if (prop.ownershipFiles.length > 0) {
                        const newProofEntries: ProofData[] = [];
                        for (const file of prop.ownershipFiles) {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `${propStoragePrefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

                            const { error: uploadError } = await sbUpload.storage
                                .from('documents')
                                .upload(fileName, file);

                            if (uploadError) {
                                alert(`${p.alerts.uploadError} ${file.name}: ${uploadError.message}`);
                                continue;
                            }

                            // Insert into ownership_proofs table
                            const { data: insertedProof, error: proofError } = await sbUpload
                                .from('ownership_proofs')
                                .insert({
                                    profile_id: profile.id,
                                    file_url: fileName,
                                    original_name: file.name,
                                    file_size: file.size,
                                    mime_type: file.type,
                                    status: 'pending',
                                })
                                .select()
                                .single();

                            if (proofError) {
                                console.error(proofError);
                            } else if (insertedProof) {
                                newProofEntries.push(insertedProof as ProofData);
                            }
                        }

                        // Update this property's saved proofs + clear pending files
                        updatedProperties[propIdx] = {
                            ...updatedProperties[propIdx],
                            ownershipFiles: [],
                            savedProofs: [...prop.savedProofs, ...newProofEntries],
                        };

                        // For property[0], also refresh all proofs from DB
                        if (propIdx === 0) {
                            const { data: proofs } = await sb
                                .from('ownership_proofs')
                                .select('*')
                                .eq('profile_id', profile.id)
                                .order('created_at', { ascending: false });
                            if (proofs) {
                                updatedProperties[0] = { ...updatedProperties[0], savedProofs: proofs as ProofData[] };
                            }
                        }
                    }

                    // 3. Upload Property Photos
                    const updatedPhotoUrls = [...prop.savedPhotos];
                    if (prop.photos.length > 0) {
                        for (const file of prop.photos) {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `photos/${propStoragePrefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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
                    }

                    // 4. Upload Property Videos
                    const updatedVideoUrls = [...prop.savedVideos];
                    if (prop.videos.length > 0) {
                        for (const file of prop.videos) {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `videos/${propStoragePrefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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
                    }

                    // 5. Upload Sub-Unit Photos & Videos
                    const updatedSubUnits = [...prop.subUnits];
                    for (let si = 0; si < updatedSubUnits.length; si++) {
                        const unit = updatedSubUnits[si];
                        if (unit.newPhotos && unit.newPhotos.length > 0) {
                            const unitPhotos = [...(unit.photos || [])];
                            for (const file of unit.newPhotos) {
                                const fileExt = file.name.split('.').pop();
                                const fileName = `photos/${propStoragePrefix}/unit-${si}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                                const { error: uploadError } = await sbUpload.storage.from('documents').upload(fileName, file);
                                if (uploadError) { console.error('Unit photo upload error:', uploadError); continue; }
                                const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                                unitPhotos.push(publicUrl);
                            }
                            updatedSubUnits[si] = { ...unit, photos: unitPhotos, newPhotos: [] };
                        }
                        if (unit.newVideos && unit.newVideos.length > 0) {
                            const unitVideos = [...(unit.videos || [])];
                            for (const file of unit.newVideos) {
                                const fileExt = file.name.split('.').pop();
                                const fileName = `videos/${propStoragePrefix}/unit-${si}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                                const { error: uploadError } = await sbUpload.storage.from('documents').upload(fileName, file);
                                if (uploadError) { console.error('Unit video upload error:', uploadError); continue; }
                                const { data: { publicUrl } } = sbUpload.storage.from('documents').getPublicUrl(fileName);
                                unitVideos.push(publicUrl);
                            }
                            updatedSubUnits[si] = { ...updatedSubUnits[si], videos: unitVideos, newVideos: [] };
                        }
                    }

                    // Update the property in our working copy
                    updatedProperties[propIdx] = {
                        ...updatedProperties[propIdx],
                        photos: [],
                        videos: [],
                        savedPhotos: updatedPhotoUrls,
                        savedVideos: updatedVideoUrls,
                        subUnits: updatedSubUnits,
                    };
                }

                // Commit updated properties to state
                setProperties(updatedProperties);

                // Sync primary property's Photos/Videos/SubUnits to Profile columns (only if properties exist)
                if (updatedProperties.length > 0) {
                    // Serialize sub-units for DB (strip File objects) — for property[0]
                    const subUnitsForDB = updatedProperties[0].subUnits.map(u => {
                        const { newPhotos: _np, newVideos: _nv, ...rest } = u;
                        return rest;
                    });

                    await sb.from('profiles').update({
                        property_photos: updatedProperties[0].savedPhotos,
                        property_videos: updatedProperties[0].savedVideos,
                        sub_units: subUnitsForDB,
                        // Also update additional_properties with uploaded URLs
                        additional_properties: updatedProperties.slice(1).map(prop => ({
                            propertyType: prop.propertyType,
                            details: prop.details,
                            subUnits: prop.subUnits.map(u => {
                                const { newPhotos: _np2, newVideos: _nv2, ...rest2 } = u;
                                return rest2;
                            }),
                            address: prop.address,
                            savedPhotos: prop.savedPhotos,
                            savedVideos: prop.savedVideos,
                            savedProofs: prop.savedProofs,
                            profilePhotoUrl: prop.profilePhotoUrl,
                        })),
                    }).eq('id', profile.id);
                }
            }

            // Update Clerk Name
            if (user && formData.name !== user.fullName) {
                await user.update({
                    firstName: formData.name.split(' ')[0],
                    lastName: formData.name.split(' ').slice(1).join(' ')
                });
            }

            if (!silent) {
                setShowSuccess(true);
                setTimeout(() => {
                    setShowSuccess(false);
                    if (activeTab === 'ownership' && view !== 'imoveis') {
                        setActiveTab('basics');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }, 2000);
            }

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
                    </div>
                </div>
            </div>




            {/* Navigation Tabs — only show when more than 1 tab */}
            {tabs.length > 1 && (
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
            )}

            {/* Content Area */}
            <div className="bg-card text-card-foreground rounded-xl border border-border p-6 min-h-[400px] shadow-sm">

                {/* OWNERSHIP TAB */}
                {activeTab === 'ownership' && (
                    <div className="space-y-8 max-w-4xl">

                        {/* Add property button (when properties exist) */}
                        {propertyCreated && (
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-foreground">
                                    {properties.length === 1 ? 'Propriedade' : `Propriedades (${properties.length})`}
                                </h3>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={properties.length >= MAX_PROPERTIES}
                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                    onClick={() => setShowAddPropertyModal(true)}
                                >
                                    <Plus className="w-4 h-4" />
                                    Adicionar Propriedade
                                </Button>
                            </div>
                        )}

                        {/* Empty state */}
                        {!propertyCreated && (
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
                        )}

                        {/* Property cards */}
                        {properties.map((prop, propIdx) => {
                            const isExpanded = expandedPropertyIdx === propIdx;
                            const propComplete = isPropertyComplete(prop);
                            const propLabel = prop.details.propertyName || `Propriedade ${propIdx + 1}`;
                            const propIcon = prop.propertyType === 'single' ? <Home className="w-4 h-4" /> : <Building2 className="w-4 h-4" />;
                            const propTypeName = prop.propertyType === 'single' ? 'Unifamiliar' : 'Multifamiliar';

                            // ── Per-property local aliases ──
                            const pAddr = prop.address;
                            const pDetails = prop.details;
                            const pSubUnits = prop.subUnits;
                            const pType = prop.propertyType;
                            const pPhotos = prop.photos;
                            const pSavedPhotos = prop.savedPhotos;
                            const pVideos = prop.videos;
                            const pSavedVideos = prop.savedVideos;
                            const pOwnershipFiles = prop.ownershipFiles;
                            const pSavedProofs = prop.savedProofs;
                            const pOwnershipOpen = prop.ownershipSectionOpen;
                            const pAddressOpen = prop.addressSectionOpen;
                            const pPhotosOpen = prop.photosSectionOpen;
                            const pDescOpen = prop.descriptionSectionOpen;
                            const pDetailsOpen = prop.detailsInitialOpen;

                            // ── Per-property setter factories ──
                            const setPropField = <K extends keyof PropertyState>(field: K, val: PropertyState[K] | ((prev: PropertyState[K]) => PropertyState[K])) => {
                                updateProperty(propIdx, prev => ({
                                    ...prev,
                                    [field]: typeof val === 'function' ? (val as (prev: PropertyState[K]) => PropertyState[K])(prev[field]) : val
                                }));
                            };
                            const setPOwnershipOpen = (v: boolean | ((p: boolean) => boolean)) => setPropField('ownershipSectionOpen', v);
                            const setPAddressOpen = (v: boolean | ((p: boolean) => boolean)) => setPropField('addressSectionOpen', v);
                            const setPPhotosOpen = (v: boolean | ((p: boolean) => boolean)) => setPropField('photosSectionOpen', v);
                            const setPDescOpen = (v: boolean | ((p: boolean) => boolean)) => setPropField('descriptionSectionOpen', v);
                            const setPDetailsOpen = (v: boolean | ((p: boolean) => boolean)) => setPropField('detailsInitialOpen', v);
                            const setPDetails = (v: PropertyDetails | ((p: PropertyDetails) => PropertyDetails)) => setPropField('details', v);
                            const setPSubUnits = (v: SubUnit[] | ((p: SubUnit[]) => SubUnit[])) => setPropField('subUnits', v);
                            const setPPhotos = (v: File[] | ((p: File[]) => File[])) => setPropField('photos', v);
                            const setPSavedPhotos = (v: string[] | ((p: string[]) => string[])) => setPropField('savedPhotos', v);
                            const setPVideos = (v: File[] | ((p: File[]) => File[])) => setPropField('videos', v);
                            const setPSavedVideos = (v: string[] | ((p: string[]) => string[])) => setPropField('savedVideos', v);
                            const setPOwnershipFiles = (v: File[] | ((p: File[]) => File[])) => setPropField('ownershipFiles', v);
                            const handlePropAddrChange = (field: string, value: string) => {
                                if (field === 'cep') {
                                    const formatted = value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
                                    updateProperty(propIdx, prev => ({ ...prev, address: { ...prev.address, cep: formatted } }));
                                    if (formatted.replace(/\D/g, '').length === 8) {
                                        fetchAddress('propertyAddress', formatted);
                                    }
                                } else {
                                    updateProperty(propIdx, prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
                                }
                            };
                            // File upload for this property
                            const handlePropFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    const newFiles = Array.from(e.target.files);
                                    setPOwnershipFiles(prev => [...prev, ...newFiles]);
                                    for (const file of newFiles) { analyzeDocument(file); }
                                }
                            };
                            const handlePropPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    const total = pSavedPhotos.length + pPhotos.length;
                                    const remaining = 10 - total;
                                    if (remaining <= 0) { alert('Máximo de 10 fotos por propriedade.'); return; }
                                    const newPhotos = Array.from(e.target.files).slice(0, remaining);
                                    setPPhotos(prev => [...prev, ...newPhotos]);
                                }
                            };
                            const removePropPhoto = (idx: number) => setPPhotos(prev => prev.filter((_, i) => i !== idx));
                            const handlePropVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    const total = pSavedVideos.length + pVideos.length;
                                    if (total >= 2) { alert('Máximo de 2 vídeos por propriedade.'); return; }
                                    setPVideos(prev => [...prev, Array.from(e.target.files!)[0]]);
                                }
                            };
                            const removePropVideo = (idx: number) => setPVideos(prev => prev.filter((_, i) => i !== idx));
                            const removePropSavedPhoto = async (url: string) => {
                                setPSavedPhotos(prev => prev.filter(u => u !== url));
                            };
                            const removePropSavedVideo = (url: string) => {
                                setPSavedVideos(prev => prev.filter(u => u !== url));
                            };
                            const removePropSavedProof = (proofId: string) => {
                                updateProperty(propIdx, prev => ({
                                    ...prev,
                                    savedProofs: prev.savedProofs.filter(p => p.id !== proofId)
                                }));
                            };
                            const removePropFile = (idx: number) => {
                                setPOwnershipFiles(prev => {
                                    const removed = prev[idx];
                                    if (removed) {
                                        setFileAnalysisStatus(s => {
                                            const next = { ...s };
                                            delete next[removed.name];
                                            return next;
                                        });
                                    }
                                    return prev.filter((_, i) => i !== idx);
                                });
                            };

                            return (
                                <div key={propIdx} className="border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-200">
                                    {/* Collapsible header */}
                                    <button
                                        type="button"
                                        onClick={() => setExpandedPropertyIdx(isExpanded ? null : propIdx)}
                                        className={cn(
                                            "flex items-center justify-between w-full px-5 py-4 transition-colors",
                                            isExpanded ? "bg-card" : "bg-muted/30 hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Profile photo thumbnail on collapsed card */}
                                            {!isExpanded && prop.profilePhotoUrl ? (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-border flex-shrink-0">
                                                    <Image src={prop.profilePhotoUrl} alt={propLabel} width={40} height={40} className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className={cn(
                                                    "p-2 rounded-lg",
                                                    prop.propertyType === 'single'
                                                        ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600"
                                                        : "bg-violet-100 dark:bg-violet-900/50 text-violet-600"
                                                )}>
                                                    {propIcon}
                                                </div>
                                            )}
                                            <div className="text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-foreground text-sm">{propLabel}</span>
                                                    <span className="text-xs text-muted-foreground">({propTypeName})</span>
                                                </div>
                                                {propComplete && !isExpanded && (
                                                    <span className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                                                        <CheckCircle2 className="w-3 h-3" /> Preenchido
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`Remover "${propLabel}"? Esta ação não pode ser desfeita.`)) {
                                                            const remainingProperties = properties.filter((_, i) => i !== propIdx);
                                                            setProperties(remainingProperties);
                                                            if (expandedPropertyIdx === propIdx) setExpandedPropertyIdx(null);
                                                            else if (expandedPropertyIdx !== null && expandedPropertyIdx > propIdx) {
                                                                setExpandedPropertyIdx(expandedPropertyIdx - 1);
                                                            }
                                                            // Persist deletion to DB using the already-filtered list
                                                            handleSave(true, remainingProperties);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.click(); }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </span>
                                            )}
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                        </div>
                                    </button>

                                    {/* Expanded wizard content for any property */}
                                    {isExpanded && (
                                        <div className="p-6 space-y-6 border-t border-border bg-card">

                                            {/* 1. Documentation Section (ownership verification — first!) */}
                                            <div id={`prop-${propIdx}-ownership`} className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setPOwnershipOpen(prev => !prev)}
                                                    className="flex items-center justify-between w-full"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={`p-2 rounded-lg ${(extractedAddressInfo?.startsWith('✅') || (!pOwnershipOpen && pSavedProofs.length > 0))
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600'
                                                            : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600'
                                                            }`}>
                                                            {(extractedAddressInfo?.startsWith('✅') || (!pOwnershipOpen && pSavedProofs.length > 0))
                                                                ? <CheckCircle2 className="w-5 h-5" />
                                                                : <FileText className="w-5 h-5" />}
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-foreground">{p.ownership.title}</h3>
                                                        {!pOwnershipOpen && (extractedAddressInfo?.startsWith('✅') || pSavedProofs.length > 0) && (
                                                            <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Verificado ✓</span>
                                                        )}
                                                    </div>
                                                    {pOwnershipOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                                </button>

                                                {pOwnershipOpen && (
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
                                                                onChange={handlePropFileUpload}
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                            />
                                                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center mb-2">
                                                                <UploadCloud className="w-6 h-6" />
                                                            </div>
                                                            <p className="font-medium text-foreground">{p.ownership.uploadPlaceholder}</p>
                                                            <p className="text-xs text-muted-foreground mt-1">{p.ownership.uploadDrop}</p>
                                                        </div>

                                                        {/* File List */}
                                                        {(pOwnershipFiles.length > 0 || pSavedProofs.length > 0) && (
                                                            <div className="space-y-2 mt-4">
                                                                {pOwnershipFiles.map((file, i) => {
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
                                                                            <Button variant="ghost" size="sm" onClick={() => removePropFile(i)} className="text-destructive">
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </Button>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {pSavedProofs.map((proof) => (
                                                                    <div key={proof.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                                                                            <div>
                                                                                <p className="text-sm font-medium text-foreground">{proof.original_name}</p>
                                                                                <p className="text-xs text-muted-foreground">Enviado em {new Date(proof.created_at).toLocaleDateString()}</p>
                                                                            </div>
                                                                        </div>
                                                                        <Button variant="ghost" size="sm" onClick={() => removePropSavedProof(proof.id)} className="text-destructive hover:text-destructive">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {/* Continuar button for Documentation → Address */}
                                                        {(pSavedProofs.length > 0 || pOwnershipFiles.length > 0) && (
                                                            <div className="flex justify-end pt-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                                    onClick={() => { handleSave(true); setPOwnershipOpen(false); setPAddressOpen(true); setTimeout(() => document.getElementById(`prop-${propIdx}-address`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
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
                                            <div id={`prop-${propIdx}-address`} className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setPAddressOpen(prev => !prev)}
                                                    className="flex items-center justify-between w-full"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg text-emerald-600">
                                                            <MapPin className="w-5 h-5" />
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-foreground">{p.basics.addressTitle}</h3>
                                                        {!pAddressOpen && pAddr.street && (
                                                            <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                                        )}
                                                    </div>
                                                    {pAddressOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                                </button>

                                                {pAddressOpen && (
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                        <div className="space-y-2">
                                                            <Label>{p.basics.cep}</Label>
                                                            <div className="relative">
                                                                <Input
                                                                    value={pAddr.cep || ''}
                                                                    onChange={(e) => handlePropAddrChange('cep', e.target.value)}
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
                                                                <Input value={pAddr.city || ''} onChange={(e) => handlePropAddrChange('city', e.target.value)} placeholder="Cidade" />
                                                                <Input value={pAddr.state || ''} onChange={(e) => handlePropAddrChange('state', e.target.value)} placeholder="UF" className="w-20" maxLength={2} />
                                                            </div>
                                                        </div>
                                                        <div className="md:col-span-3 space-y-2">
                                                            <Label>{p.basics.street}</Label>
                                                            <Input value={pAddr.street || ''} onChange={(e) => handlePropAddrChange('street', e.target.value)} placeholder="Rua / Avenida" />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>{p.basics.number}</Label>
                                                            <Input value={pAddr.number || ''} onChange={(e) => handlePropAddrChange('number', e.target.value)} placeholder="123" />
                                                        </div>
                                                        <div className="md:col-span-2 space-y-2">
                                                            <Label>{p.basics.neighborhood}</Label>
                                                            <Input value={pAddr.neighborhood || ''} onChange={(e) => handlePropAddrChange('neighborhood', e.target.value)} placeholder="Bairro" />
                                                        </div>
                                                        <div className="md:col-span-2 space-y-2">
                                                            <Label>{p.basics.complement}</Label>
                                                            <Input value={pAddr.complement || ''} onChange={(e) => handlePropAddrChange('complement', e.target.value)} placeholder={p.basics.complement} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Continuar button for Address → Details */}
                                                {pAddressOpen && pAddr.cep && pAddr.city && (
                                                    <div className="flex justify-end pt-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                            onClick={() => { setPAddressOpen(false); setPDetailsOpen(true); handleSave(true); setTimeout(() => document.getElementById(`prop-${propIdx}-details`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
                                                        >
                                                            Continuar <ArrowRight className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 3. Detalhes Section */}
                                            <div id={`prop-${propIdx}-details`} />
                                            <PropertyDetailsCard
                                                key={`details-${propIdx}-${pDetailsOpen}`}
                                                details={pDetails}
                                                units={pSubUnits}
                                                onDetailsChange={setPDetails}
                                                onUnitsChange={setPSubUnits}
                                                propertyType={pType}
                                                initialOpen={pDetailsOpen}
                                                onOpenChange={(open) => setPDetailsOpen(open)}
                                                onContinue={() => { setPDetailsOpen(false); setPPhotosOpen(true); handleSave(true); setTimeout(() => document.getElementById(`prop-${propIdx}-photos`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
                                                }
                                            />

                                            {/* 4. Photos & Videos Section — Main Property — Collapsible */}
                                            <div id={`prop-${propIdx}-photos`} className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setPPhotosOpen(prev => !prev)}
                                                    className="flex items-center justify-between w-full"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600">
                                                            <Camera className="w-5 h-5" />
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-foreground">Fotos e Vídeos do Imóvel</h3>
                                                        {!pPhotosOpen && (pSavedPhotos.length > 0 || pPhotos.length > 0 || pSavedVideos.length > 0 || pVideos.length > 0) && (
                                                            <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                                                {pSavedPhotos.length + pPhotos.length} fotos · {pSavedVideos.length + pVideos.length} vídeos
                                                            </span>
                                                        )}
                                                    </div>
                                                    {pPhotosOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                                </button>

                                                {pPhotosOpen && (
                                                    <>
                                                        <div className="bg-muted/30 p-4 rounded-lg border border-border flex gap-3 items-start">
                                                            <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                                            <div>
                                                                <p className="text-sm font-medium text-foreground mb-1">Dica Profissional</p>
                                                                <p className="text-sm text-muted-foreground">Imóveis com pelo menos 5 fotos recebem 4x mais visualizações! Capriche na iluminação.</p>
                                                            </div>
                                                        </div>

                                                        {/* Photos (up to 10) */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                                                    <Camera className="w-4 h-4 text-muted-foreground" />
                                                                    Fotos
                                                                </p>
                                                                <span className="text-xs text-muted-foreground">{pSavedPhotos.length + pPhotos.length}/10</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                                {/* Upload Button */}
                                                                {pSavedPhotos.length + pPhotos.length < 10 && (
                                                                    <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                                                        <input
                                                                            type="file"
                                                                            multiple
                                                                            accept="image/*"
                                                                            onChange={handlePropPhotoSelect}
                                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                        />
                                                                        <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                                                                        <span className="text-xs text-muted-foreground">Adicionar Fotos</span>
                                                                    </div>
                                                                )}

                                                                {/* New Photos */}
                                                                {pPhotos.map((file, idx) => (
                                                                    <PhotoPreview key={`new-p-${idx}`} file={file} onRemove={() => removePropPhoto(idx)} />
                                                                ))}

                                                                {/* Saved Photos */}
                                                                {pSavedPhotos.map((url, idx) => {
                                                                    const isProfilePhoto = prop.profilePhotoUrl === url;
                                                                    return (
                                                                        <div key={`saved-p-${idx}`} className={cn("aspect-square rounded-lg border relative group overflow-hidden", isProfilePhoto ? "border-emerald-500 border-2 ring-2 ring-emerald-200 dark:ring-emerald-800" : "border-border")}>
                                                                            <Image src={url} alt="Property" width={200} height={200} className="w-full h-full object-cover" />
                                                                            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removePropSavedPhoto(url)}>
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                            {/* Profile photo selection checkbox */}
                                                                            <label
                                                                                className={cn(
                                                                                    "absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium cursor-pointer transition-colors",
                                                                                    isProfilePhoto
                                                                                        ? "bg-emerald-600 text-white"
                                                                                        : "bg-black/50 text-white opacity-0 group-hover:opacity-100"
                                                                                )}
                                                                                onClick={(e) => { e.stopPropagation(); updateProperty(propIdx, prev => ({ ...prev, profilePhotoUrl: isProfilePhoto ? null : url })); }}
                                                                            >
                                                                                <input type="checkbox" checked={isProfilePhoto} readOnly className="w-3 h-3 accent-emerald-500" />
                                                                                {isProfilePhoto ? 'Foto Principal' : 'Definir como principal'}
                                                                            </label>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Videos (up to 2) */}
                                                        <div className="space-y-2 pt-3 border-t border-border">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                                                    <Video className="w-4 h-4 text-muted-foreground" />
                                                                    Vídeos
                                                                </p>
                                                                <span className="text-xs text-muted-foreground">{pSavedVideos.length + pVideos.length}/2</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                                {pSavedVideos.length + pVideos.length < 2 && (
                                                                    <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                                                        <input
                                                                            type="file"
                                                                            accept="video/*"
                                                                            onChange={handlePropVideoSelect}
                                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                        />
                                                                        <Video className="w-8 h-8 text-muted-foreground mb-2" />
                                                                        <span className="text-xs text-muted-foreground">Adicionar Vídeo</span>
                                                                    </div>
                                                                )}

                                                                {/* New Videos */}
                                                                {pVideos.map((file, idx) => (
                                                                    <div key={`new-v-${idx}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden bg-muted">
                                                                        <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" muted />
                                                                        <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removePropVideo(idx)}>
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </Button>
                                                                        </div>
                                                                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 text-center flex items-center justify-center gap-1">
                                                                            <Video className="w-3 h-3" /> {file.name}
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                {/* Saved Videos */}
                                                                {pSavedVideos.map((url, idx) => (
                                                                    <div key={`saved-v-${idx}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden">
                                                                        <video src={url} className="w-full h-full object-cover" muted />
                                                                        <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removePropSavedVideo(url)}>
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
                                                        {/* Continuar button for Photos → Description */}
                                                        {((pPhotos.length + pSavedPhotos.length) > 0 || (pVideos.length + pSavedVideos.length) > 0) && (
                                                            <div className="flex justify-end pt-4">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                                    onClick={() => { setPPhotosOpen(false); setPDescOpen(true); handleSave(true); setTimeout(() => document.getElementById(`prop-${propIdx}-description`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
                                                                >
                                                                    Continuar <ArrowRight className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* 5. Description Section — Main Property — Collapsible */}
                                            <div id={`prop-${propIdx}-description`} className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setPDescOpen(prev => !prev)}
                                                    className="flex items-center justify-between w-full"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-foreground">Descrição do Imóvel</h3>
                                                        {!pDescOpen && pAddr.description && (
                                                            <span className="ml-2 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">Preenchido ✓</span>
                                                        )}
                                                    </div>
                                                    {pDescOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                                </button>
                                                {pDescOpen && (
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
                                                                onClick={() => generateMainDescription(propIdx)}
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
                                                            value={pAddr.description || ''}
                                                            onChange={(e) => handlePropAddrChange('description', e.target.value)}
                                                        />
                                                        <span className="text-xs text-muted-foreground">Esta descrição será exibida no anúncio do imóvel principal.</span>
                                                    </div>
                                                )}

                                                {/* No Continuar button here — user uses "Salvar Imóvel e Documentos" */}
                                            </div>

                                            {/* 6. Sub-unidades Section (at the bottom, only for multi) */}
                                            {pType === 'multi' && pDetails.numberOfUnits > 0 && (
                                                <>
                                                    <div id={`prop-${propIdx}-subunits`} />
                                                    <SubUnitsSection
                                                        key={`subunits-${propIdx}-${prop.subUnitOpenIdx}`}
                                                        details={pDetails}
                                                        units={pSubUnits}
                                                        onDetailsChange={setPDetails}
                                                        onUnitsChange={setPSubUnits}
                                                        onGenerateDescription={(unitIdx) => generateUnitDescription(propIdx, unitIdx)}
                                                        generatingDescriptionIdx={generatingUnitDescriptionIdx}
                                                        onImportContract={(unitIdx, file) => importContract(propIdx, unitIdx, file)}
                                                        importingContractIdx={importingContractIdx}
                                                        initialOpenIdx={prop.subUnitOpenIdx ?? undefined}
                                                        propertyIndex={propIdx}
                                                    />
                                                </>
                                            )}

                                        </div>
                                    )
                                    }

                                </div>
                            );
                        })}

                        {propertyCreated && (
                        <div className="flex justify-end pt-4">
                            <Button size="lg" onClick={async () => { await handleSave(); setExpandedPropertyIdx(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={isSaving} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                Salvar Imóvel e Documentos
                            </Button>
                        </div>
                        )}
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
                        <div id="holding-identity" className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
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

                        {/* Continuar: Identity → Holding */}
                        {identitySectionOpen && (identityResult?.success || formData.cpf || formData.cnpj) && (
                            <div className="flex justify-end -mt-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                    onClick={() => { setIdentitySectionOpen(false); setHoldingSectionOpen(true); setTimeout(() => document.getElementById('holding-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
                                >
                                    Continuar <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        )}

                        <div id="holding-data" className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
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

                        {/* Continuar: Holding → Admin (only for PJ) */}
                        {holdingSectionOpen && formData.name && formData.phone && personType === 'pj' && (
                            <div className="flex justify-end -mt-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                    onClick={() => { setHoldingSectionOpen(false); setAdminSectionOpen(true); setTimeout(() => document.getElementById('holding-admin')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }}
                                >
                                    Continuar <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        )}

                        {/* ADMIN DATA CARD — Only for PJ */}
                        {personType === 'pj' && (
                            <div id="holding-admin" className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-6">
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
                            <Button size="lg" onClick={() => handleSave()} disabled={isSaving} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-900/20">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                {p.basics.save}
                            </Button>
                        </div>

                        {/* Notification Preferences — shown in proprietário view */}
                        {view === 'proprietario' && (
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
                        )}

                        {/* Delete Account — shown in proprietário view */}
                        {view === 'proprietario' && (
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
                        )}
                    </div>
                )}


                {/* SECURITY TAB — Gerenciar Propriedades (Quick Actions) */}
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

                            </div>
                        </div>

                        {/* Notifications — shown in full view only (proprietário view has its own copy) */}
                        {view === 'full' && (
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
                        )}

                        {/* Delete Account — shown in full view only (proprietário view has its own copy) */}
                        {view === 'full' && (
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
                        )}
                    </div>
                )}

            </div>

            {/* Delete Account Modal (Simple Overlay) */}
            {
                showDeleteModal && (
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
                )
            }

            {/* Add Property Modal */}
            {
                showAddPropertyModal && (
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
                                        const newProp = createEmptyProperty('single');
                                        setProperties(prev => [...prev, newProp]);
                                        setExpandedPropertyIdx(properties.length); // expand the newly added
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
                                        const newProp = createEmptyProperty('multi');
                                        setProperties(prev => [...prev, newProp]);
                                        setExpandedPropertyIdx(properties.length); // expand the newly added
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
                )
            }

        </div >
    );
}
