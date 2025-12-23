import { getDictionary } from "../../../dictionaries";
import ProfileContent from "./ProfileContent";

export default async function ProfilePage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return <ProfileContent dict={dict} />;
}
