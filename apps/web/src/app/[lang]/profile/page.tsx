import { redirect } from 'next/navigation';

export default async function ProfilePage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    redirect(`/${lang}/proprietario`);
}
