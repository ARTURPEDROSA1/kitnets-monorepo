import { getDictionary } from "../../../dictionaries";
import ProfileContent from "../profile/ProfileContent";

export default async function ImoveisPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return <ProfileContent dict={dict} view="imoveis" />;
}
