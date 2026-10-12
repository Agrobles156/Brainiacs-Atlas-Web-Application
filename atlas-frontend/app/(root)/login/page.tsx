import LogPage from '@/components/Auth/Login/Login-Page';
import ClientOnly from '@/components/ClientOnly';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function LoginPage() {
  return (
    <ErrorBoundary>
      <div className="container max-w-full">
        <ClientOnly fallback={<div className="flex items-center justify-center min-h-screen bg-[#1c2532] text-white">Loading...</div>}>
          <LogPage />
        </ClientOnly>
      </div>
    </ErrorBoundary>
  );
}