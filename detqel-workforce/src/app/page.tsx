import { LoginForm } from "@/components/Login/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 bg-[#f8f9fc] text-slate-900 selection:bg-[#8a2be2] selection:text-white">
      <div className="w-full max-w-[1140px] mx-auto">
        <LoginForm />
      </div>
    </main>
  );
}
