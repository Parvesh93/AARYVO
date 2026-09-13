import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return <main className="flex min-h-screen items-center justify-center px-6 py-12">
    <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-xl shadow-black/5 md:p-10">
      <Link href="/" className="font-semibold tracking-[0.25em]">AARYVO</Link>
      <p className="mt-12 text-sm uppercase tracking-[0.2em] text-black/40">Welcome back</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Sign in to your AI workforce.</h1>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-black/50">New to AARYVO? <Link href="/signup" className="font-medium text-black">Create account</Link></p>
    </div>
  </main>;
}
