import { useAuth } from "@/hooks/use-auth";
import { ChatInterface } from "@/components/chat-interface";
import { Button } from "@/components/ui/button";
import { LogOut, Mail, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerification, setShowVerification] = useState(false);

  const handleVerify = async () => {
    try {
      setIsVerifying(true);
      await apiRequest("POST", "/api/verify", {
        email: user?.email,
        code: verificationCode,
      });

      toast({
        title: "Success",
        description: "Your email has been verified!",
      });

      // Refresh the page to update user status
      window.location.reload();
    } catch (error) {
      toast({
        title: "Verification failed",
        description: "Invalid verification code",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await apiRequest("POST", "/api/resend-verification", {});
      toast({
        title: "Verification code sent",
        description: "Please check your email for the new code",
      });
    } catch (error) {
      toast({
        title: "Failed to send code",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold">AI Chat</h1>
          <div className="flex items-center gap-4">
            {!user?.verified && (
              <Button
                variant="outline"
                className="gap-2 text-yellow-600"
                onClick={() => setShowVerification(!showVerification)}
              >
                <AlertTriangle className="h-4 w-4" />
                Verify Email
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {user?.username || user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {!user?.verified && showVerification && (
        <div className="border-b bg-yellow-50 dark:bg-yellow-900/10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-2 text-yellow-600">
                <Mail className="h-4 w-4" />
                <span>Please verify your email address</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter verification code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-48"
                />
                <Button
                  variant="outline"
                  onClick={handleVerify}
                  disabled={isVerifying}
                >
                  Verify
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleResendCode}
                  disabled={isVerifying}
                >
                  Resend Code
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto px-4 py-8">
        <ChatInterface />
      </main>
    </div>
  );
}