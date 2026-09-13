import Link from "next/link";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return <main className="flex min-h-screen items-center justify-center px-6 py-12">
    <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-xl shadow-black/5 md:p-10">
      <Link href="/" className="font-semibold tracking-[0.25em]">AARYVO</Link>
      <p className="mt-12 text-sm uppercase tracking-[0.2em] text-black/40">Get started</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Build your first AI employee.</h1>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-black/50">Already have an account? <Link href="/login" className="font-medium text-black">Sign in</Link></p>
    </div>
  </main>;
}
