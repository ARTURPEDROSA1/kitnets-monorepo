import { getDictionary } from "../../../dictionaries";
import ProfileContent from "../profile/ProfileContent";

export default async function ProprietarioPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return <ProfileContent dict={dict} view="proprietario" />;
}
