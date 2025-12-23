"use client";

import React, { createContext, useContext, useReducer, ReactNode, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ListingData, StepId, STEPS } from "./types";

interface AnunciarState {
    currentStep: number; // Index in STEPS
    data: ListingData;
}

type AnunciarAction =
    | { type: "NEXT_STEP" }
    | { type: "PREV_STEP" }
    | { type: "GOTO_STEP"; index: number }
    | { type: "UPDATE_DATA"; payload: Partial<ListingData> }
    | { type: "UPDATE_LOCATION"; payload: Partial<ListingData["location"]> }
    | { type: "UPDATE_DETAILS"; payload: Partial<ListingData["details"]> }
    | { type: "UPDATE_MEDIA"; payload: Partial<ListingData["media"]> }
    | { type: "UPDATE_CONTACT"; payload: Partial<ListingData["contact"]> }
    | { type: "UPDATE_IDENTITY"; payload: Partial<ListingData["identity"]> }
    | { type: "UPDATE_OWNERSHIP"; payload: Partial<ListingData["ownership"]> };

const initialState: AnunciarState = {
    currentStep: 0,
    data: {
        role: null,
        intent: null,
        propertyType: null,
        location: { city: "", state: "", neighborhood: "", street: "", number: "", complement: "", address: "", zip: "" },
        details: {
            area: "",
            bedrooms: 0,
            bathrooms: 0,
            parking: 0,
            furnished: false,
            pets: false,
            deliveryDate: "",
            units: "",
            rentValue: "",
            condoFee: "",
            tax: "",
            minPeriod: "",
            salePrice: "",
            financing: false,
        },
        media: { photos: [], video: null, pdf: null },
        description: "",
        contact: { email: "", phone: "", whatsapp: false },
        identity: {
            cpf: "",
            cnpj: "",
            creci: "",
            fullName: "",
            businessName: "",
            tradeName: "",
            birthDate: "",
        },
        ownership: {
            documents: [],
            verified: false,
        },
    },
};

const AnunciarContext = createContext<{
    state: AnunciarState;
    dispatch: React.Dispatch<AnunciarAction>;
    nextStep: () => void;
    prevStep: () => void;
    updateData: (data: Partial<ListingData>) => void;
    stepId: StepId;
    progress: number;
    lang: string;
} | null>(null);

function reducer(state: AnunciarState, action: AnunciarAction): AnunciarState {
    switch (action.type) {
        case "NEXT_STEP":
            return { ...state, currentStep: Math.min(state.currentStep + 1, STEPS.length - 1) };
        case "PREV_STEP":
            return { ...state, currentStep: Math.max(state.currentStep - 1, 0) };
        case "GOTO_STEP":
            return { ...state, currentStep: action.index };
        case "UPDATE_DATA":
            return { ...state, data: { ...state.data, ...action.payload } };
        case "UPDATE_LOCATION":
            return { ...state, data: { ...state.data, location: { ...state.data.location, ...action.payload } } };
        case "UPDATE_DETAILS":
            return { ...state, data: { ...state.data, details: { ...state.data.details, ...action.payload } } };
        case "UPDATE_MEDIA":
            return { ...state, data: { ...state.data, media: { ...state.data.media, ...action.payload } } };
        case "UPDATE_CONTACT":
            return { ...state, data: { ...state.data, contact: { ...state.data.contact, ...action.payload } } };
        case "UPDATE_IDENTITY":
            return { ...state, data: { ...state.data, identity: { ...state.data.identity, ...action.payload } } };
        case "UPDATE_OWNERSHIP":
            return { ...state, data: { ...state.data, ownership: { ...state.data.ownership, ...action.payload } } };
        default:
            return state;
    }
}

export function AnunciarProvider({ children, lang = 'pt' }: { children: ReactNode, lang?: string }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const searchParams = useSearchParams();

    // Initialize from query params
    useEffect(() => {
        if (!searchParams) return;

        const roleParam = searchParams.get('role');
        const stepParam = searchParams.get('step');
        const emailParam = searchParams.get('email'); // Get email from URL
        const hydrateParam = searchParams.get('hydrate');

        if (hydrateParam === 'true') {
            const storedDraft = localStorage.getItem('kitnets_draft_listing');
            if (storedDraft) {
                try {
                    const parsedDraft = JSON.parse(storedDraft);
                    dispatch({ type: "UPDATE_DATA", payload: parsedDraft });
                    // Provide a small delay or ensure state works before setting step? No, reducer is sync.

                    // If step param is also present, it overrides. If not, default to review?
                    // User request implies going nicely to review.
                    // But if 'step' param is explicit, let it win. Use stepParam logic below.
                    if (!stepParam) {
                        const reviewIndex = STEPS.indexOf('review');
                        if (reviewIndex > -1) dispatch({ type: "GOTO_STEP", index: reviewIndex });
                    }
                } catch (e) {
                    console.error("Failed to parse draft listing", e);
                }
            }
        }

        if (roleParam) {
            // Map string to UserRole validation
            if (['owner', 'broker', 'agency', 'developer'].includes(roleParam)) {
                dispatch({ type: "UPDATE_DATA", payload: { role: roleParam as any } });
            }
        }

        if (emailParam) {
            dispatch({ type: "UPDATE_CONTACT", payload: { email: emailParam } });
        }

        if (stepParam) {
            const stepIndex = STEPS.indexOf(stepParam as StepId);
            if (stepIndex > -1) {
                dispatch({ type: "GOTO_STEP", index: stepIndex });
            }
        }

        // 3. If no email from URL, try localStorage (Auto-fill) and NOT hydrating full draft
        if (!emailParam && hydrateParam !== 'true') {
            const storedEmail = localStorage.getItem('kitnets_user_email');
            if (storedEmail) {
                dispatch({ type: "UPDATE_CONTACT", payload: { email: storedEmail } });
            }
        }
    }, [searchParams]);

    // Auto-save simulation
    useEffect(() => {
        // In a real app, save to localStorage or backend here
        // console.log("Auto-saving", state.data);
    }, [state.data]);

    const nextStep = () => dispatch({ type: "NEXT_STEP" });
    const prevStep = () => dispatch({ type: "PREV_STEP" });
    const updateData = (data: Partial<ListingData>) => dispatch({ type: "UPDATE_DATA", payload: data });

    const stepId = STEPS[state.currentStep];
    const progress = Math.round(((state.currentStep + 1) / STEPS.length) * 100);

    return (
        <AnunciarContext.Provider
            value={{ state, dispatch, nextStep, prevStep, updateData, stepId, progress, lang }}
        >
            {children}
        </AnunciarContext.Provider>
    );
}

export function useAnunciar() {
    const context = useContext(AnunciarContext);
    if (!context) {
        throw new Error("useAnunciar must be used within an AnunciarProvider");
    }
    return context;
}
