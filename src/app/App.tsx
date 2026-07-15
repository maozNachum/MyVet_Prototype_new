import { Suspense } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50" dir="rtl" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-[14px] font-semibold text-slate-600 shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden="true" />
        טוען את MyVet...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
