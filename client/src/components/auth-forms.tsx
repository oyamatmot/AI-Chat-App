import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, resetPasswordSchema } from "@shared/schema";
import type { InsertUser } from "@shared/schema";
import { z } from "zod";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export function AuthForms() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const { toast } = useToast();
  const { loginMutation, registerMutation } = useAuth();

  const loginForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: { email: "", password: "" },
  });

  const verifyForm = useForm({
    resolver: zodResolver(verifySchema),
    defaultValues: { email: verifyEmail, code: "" },
  });

  const resetForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: "", code: "", password: "" },
  });

  const handleRegister = async (data: InsertUser) => {
    try {
      await registerMutation.mutateAsync(data);
      setVerifyEmail(data.email);
      setMode("verify");
      toast({
        title: "Verification code sent",
        description: "Please check your email for the verification code",
      });
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleVerify = async (data: { email: string; code: string }) => {
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Invalid verification code");
      setMode("login");
      toast({
        title: "Email verified",
        description: "You can now log in with your credentials",
      });
    } catch (error) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async (data: { email: string }) => {
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Email not found");
      setMode("reset");
      toast({
        title: "Reset code sent",
        description: "Please check your email for the reset code",
      });
    } catch (error) {
      toast({
        title: "Request failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (data: z.infer<typeof resetPasswordSchema>) => {
    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Invalid or expired reset code");
      setMode("login");
      toast({
        title: "Password reset successful",
        description: "You can now log in with your new password",
      });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (mode === "verify") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify Email</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={verifyForm.handleSubmit(handleVerify)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                placeholder="Enter code from email"
                {...verifyForm.register("code")}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={verifyForm.formState.isSubmitting}
            >
              {verifyForm.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Verify Email"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (mode === "forgot" || mode === "reset") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {mode === "forgot" ? "Forgot Password" : "Reset Password"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={
              mode === "forgot"
                ? resetForm.handleSubmit(handleForgotPassword)
                : resetForm.handleSubmit(handleResetPassword)
            }
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                {...resetForm.register("email")}
              />
            </div>
            {mode === "reset" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code">Reset Code</Label>
                  <Input
                    id="code"
                    placeholder="Enter code from email"
                    {...resetForm.register("code")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    {...resetForm.register("password")}
                  />
                </div>
              </>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={resetForm.formState.isSubmitting}
            >
              {resetForm.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "forgot" ? (
                "Send Reset Code"
              ) : (
                "Reset Password"
              )}
            </Button>
            <Button
              variant="link"
              className="w-full"
              onClick={() => setMode("login")}
            >
              Back to Login
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Welcome to AI Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form onSubmit={loginForm.handleSubmit(loginMutation.mutate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  icon={<Mail className="h-4 w-4" />}
                  {...loginForm.register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock className="h-4 w-4" />}
                    {...loginForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </Button>
              <Button
                variant="link"
                className="w-full"
                onClick={() => setMode("forgot")}
              >
                Forgot Password?
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="register">
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  icon={<Mail className="h-4 w-4" />}
                  {...registerForm.register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  icon={<Lock className="h-4 w-4" />}
                  {...registerForm.register("password")}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
