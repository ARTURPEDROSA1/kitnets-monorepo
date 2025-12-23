"use client";

import { useState } from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Button } from "@kitnets/ui";
import { MapPin, Image as ImageIcon, Loader2 } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import { createBrowserClient } from "@supabase/ssr";

export function Step9Review() {
    const { state, nextStep, dispatch } = useAnunciar();
    const { data } = state;
    const { user } = useUser();
    const { getToken } = useAuth();
    const [isPublishing, setIsPublishing] = useState(false);

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            const token = await getToken({ template: 'supabase' });
            const sb = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                { global: { headers: { Authorization: `Bearer ${token}` } } }
            );

            // 1. Get Profile ID
            const { data: profile } = await sb
                .from('profiles')
                .select('id')
                .eq('clerk_id', user?.id)
                .single();

            if (!profile) throw new Error("Profile not found");

            // 2. Upload Photos
            const photoUrls: string[] = [];
            for (const file of data.media.photos) {
                if (typeof file === 'string') {
                    photoUrls.push(file);
                } else {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${profile.id}/${Date.now()}-${Math.random()}.${fileExt}`;
                    const { error: uploadError } = await sb.storage
                        .from('documents') // Using documents bucket for now per schema
                        .upload(fileName, file);

                    if (uploadError) {
                        console.error("Upload error", uploadError);
                        continue;
                    }

                    const { data: { publicUrl } } = sb.storage.from('documents').getPublicUrl(fileName);
                    photoUrls.push(publicUrl);
                }
            }

            // 3. Insert Listing
            const priceStr = data.intent === 'rent' ? data.details.rentValue : data.details.salePrice;
            const price = parseFloat(priceStr.replace(/[^0-9,.]/g, '').replace(',', '.'));

            const area = parseFloat(data.details.area.replace(/[^0-9,.]/g, '').replace(',', '.'));

            const { error: insertError } = await sb
                .from('listings')
                .insert({
                    profile_id: profile.id,
                    title: `${data.propertyType === 'kitnet' ? 'Kitnet' : 'Imóvel'} em ${data.location.neighborhood}`,
                    description: data.description,
                    price: isNaN(price) ? 0 : price,
                    area: isNaN(area) ? 0 : area,
                    bedrooms: data.details.bedrooms,
                    bathrooms: data.details.bathrooms,
                    parking: data.details.parking,
                    location: data.location,
                    photos: photoUrls,
                    type: data.propertyType,
                    intent: data.intent
                });

            if (insertError) throw insertError;

            // Success
            localStorage.removeItem('kitnets_draft_listing');
            nextStep();

        } catch (error) {
            console.error(error);
            alert("Erro ao publicar anúncio. Tente novamente.");
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <StepLayout title="Revisar e Publicar" subtitle="Confira se está tudo certo antes de colocar no ar.">
            <div className="space-y-6 bg-card border rounded-xl p-6 shadow-sm">

                {/* Summary Card */}
                <div className="flex items-start gap-4 pb-4 border-b">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                        {data.media.photos.length > 0 ? (
                            <img src={typeof data.media.photos[0] === 'string' ? data.media.photos[0] : URL.createObjectURL(data.media.photos[0])} alt="Property preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <ImageIcon className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg capitalize">{data.propertyType} para {data.intent === 'rent' ? 'Alugar' : data.intent === 'sale' ? 'Venda' : 'Lançamento'}</h3>
                        <div className="flex items-center text-muted-foreground text-sm mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {data.location.city} - {data.location.neighborhood}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div>
                        <span className="text-muted-foreground block">Área</span>
                        <span className="font-medium">{data.details.area} m²</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Quartos</span>
                        <span className="font-medium">{data.details.bedrooms}</span>
                    </div>

                    {(data.intent === 'rent' || data.intent === 'sale') && (
                        <div className="col-span-2">
                            <span className="text-muted-foreground block">Valor</span>
                            <span className="font-semibold text-lg text-primary dark:text-emerald-500">
                                R$ {data.intent === 'rent' ? data.details.rentValue : data.details.salePrice}
                            </span>
                        </div>
                    )}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => dispatch({ type: "GOTO_STEP", index: 0 })}
                >
                    Editar informações
                </Button>

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    onClick={handlePublish}
                    disabled={isPublishing}
                >
                    {isPublishing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    {isPublishing ? 'Publicando...' : 'Publicar Anúncio'}
                </Button>
            </div>
        </StepLayout>
    );
}
