import { useAuth } from "@/hooks/use-auth";
import { AuthForms } from "@/components/auth-forms";
import { Redirect } from "wouter";

export default function AuthPage() {
  const { user } = useAuth();

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <AuthForms />
      </div>
      
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/90 to-primary items-center justify-center p-8">
        <div className="max-w-md text-white">
          <h1 className="text-4xl font-bold mb-6">
            Welcome to AI Chat
          </h1>
          <p className="text-lg opacity-90 mb-8">
            Experience intelligent conversations powered by advanced AI technology.
            Sign in or create an account to get started.
          </p>
          <div className="grid grid-cols-2 gap-6 text-sm opacity-75">
            <div>
              <h3 className="font-semibold mb-2">Smart Conversations</h3>
              <p>Engage in natural dialogue with our AI assistant</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Secure Access</h3>
              <p>Your conversations are private and protected</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
