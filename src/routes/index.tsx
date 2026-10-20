import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const App = lazy(() => import("../app/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SIM Asrama Haji Jakarta" },
      { name: "description", content: "Sistem Informasi Manajemen Akomodasi & Operasional UPT Asrama Haji Jakarta" },
      { property: "og:title", content: "SIM Asrama Haji Jakarta" },
      { property: "og:description", content: "Sistem Informasi Manajemen Akomodasi & Operasional UPT Asrama Haji Jakarta" },
    ],
  }),
  component: Index,
});

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-sm">Memuat…</div>;
}

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <ClientOnly fallback={<Loading />}>
        <Suspense fallback={<Loading />}>
          <App />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
