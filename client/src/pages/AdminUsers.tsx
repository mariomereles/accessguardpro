import { useState } from "react";
import { Loader2, Plus, UserCog } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { email: "", password: "", role: "STAFF", orgId: "" };

// Administrators create ORGANIZER / STAFF / ADMIN accounts here (public sign-up only ever makes attendees).
export default function AdminUsers() {
  const { user: me, isAdmin, isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api.listUsers(),
    enabled: isAdmin,
  });
  const { data: orgs } = useQuery({
    queryKey: ["/api/orgs"],
    queryFn: () => api.listOrgs(),
    enabled: isPlatformAdmin,
  });
  const orgName = (id?: string | null) => (id ? orgs?.find((o: any) => o.id === id)?.name ?? "Your organization" : "Platform");

  const create = useMutation({
    mutationFn: () =>
      api.createUser({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        orgId: isPlatformAdmin ? form.orgId || null : undefined,
      }),
    onSuccess: () => {
      toast({ title: "User created", description: "Share the password with them through a secure channel." });
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: any) => toast({ title: "Could not create the user", description: e.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.setUserStatus(v.id, v.status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
    onError: (e: any) => toast({ title: "Could not update the user", description: e.message, variant: "destructive" }),
  });

  if (!isAdmin) {
    return <p className="text-muted-foreground" data-testid="text-forbidden">Only administrators can manage users.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            {isPlatformAdmin ? "Accounts across every organization" : "Accounts of your organization"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-user"><Plus className="w-4 h-4 mr-2" />New user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>Staff scan tickets at the gates; organizers also manage events and gates.</DialogDescription>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input id="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Initial password (at least 10 characters)</Label>
                <Input id="user-password" type="password" autoComplete="new-password" minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff (scanner)</SelectItem>
                    <SelectItem value="ORGANIZER">Organizer</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isPlatformAdmin && (
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v === "none" ? "" : v })}>
                    <SelectTrigger data-testid="select-user-org"><SelectValue placeholder="Platform (no organization)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Platform (no organization)</SelectItem>
                      {orgs?.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Only administrators can be created without an organization.</p>
                </div>
              )}
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create user
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5" />Accounts</CardTitle>
          <CardDescription>Suspending an account signs the person out immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {isPlatformAdmin && <TableHead>Organization</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u: any) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.email}`}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
                    {isPlatformAdmin && <TableCell>{orgName(u.orgId)}</TableCell>}
                    <TableCell>
                      <Badge variant={u.status === "ACTIVE" ? "default" : "destructive"}>{u.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id !== me?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: u.id, status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}
                          data-testid={`button-toggle-${u.email}`}
                        >
                          {u.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
