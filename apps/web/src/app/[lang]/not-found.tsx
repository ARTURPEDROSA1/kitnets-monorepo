import Link from "next/link";
import { Button } from "@kitnets/ui";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h1 className="text-6xl font-extrabold text-primary mb-4">404</h1>
            <h2 className="text-2xl font-bold text-foreground mb-6">Página não encontrada</h2>
            <p className="text-muted-foreground max-w-md mb-8">
                Desculpe, a página que você está procurando não existe ou foi movida.
            </p>
            <Link href="/">
                <Button size="lg">
                    Voltar para o início
                </Button>
            </Link>
        </div>
    );
}
