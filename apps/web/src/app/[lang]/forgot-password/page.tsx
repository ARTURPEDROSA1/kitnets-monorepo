
import { getDictionary } from "../../../dictionaries";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
            <div className="w-full max-w-md space-y-8">
                <div className="bg-card border border-border rounded-xl shadow-lg p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-foreground">Recuperar Senha</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Digite seu email para redefinir sua senha.
                        </p>
                    </div>
                    <ForgotPasswordForm dict={dict} lang={lang} />
                </div>
            </div>
        </div>
    );
}
