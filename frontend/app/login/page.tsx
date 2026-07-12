import { Suspense } from "react";
import LoginPage from "./LoginForm";

export default function Page() {
  return (
    <Suspense fallback={<main className="py-16 text-center text-muted">Carregando...</main>}>
      <LoginPage />
    </Suspense>
  );
}
