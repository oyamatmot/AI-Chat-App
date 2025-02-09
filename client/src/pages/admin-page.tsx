import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Redirect } from "wouter";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Redirect if not admin
  if (!user?.isAdmin) {
    return <Redirect to="/" />;
  }

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const handleToggleVerification = async (userId: number, verified: boolean) => {
    try {
      await apiRequest("POST", `/api/admin/users/${userId}/verify`, { verified });
      toast({
        title: "Success",
        description: "User verification status updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user verification status",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-muted-foreground mt-1">
                Manage and monitor user accounts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="px-4 py-1">
              Total Users: {users?.length || 0}
            </Badge>
          </div>
        </div>

        {/* Main Content */}
        <Card className="shadow-lg">
          <CardHeader className="bg-card border-b">
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id} className="hover:bg-accent/50">
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.username || "-"}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={user.verified ? "default" : "secondary"}
                        className="gap-1 px-2 py-1 inline-flex items-center"
                      >
                        {user.verified ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        <span>{user.verified ? "Verified" : "Unverified"}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleVerification(user.id, !user.verified)}
                        className="hover:bg-primary/10"
                      >
                        {user.verified ? "Unverify" : "Verify"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}