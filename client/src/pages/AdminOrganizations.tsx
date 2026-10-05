import { useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Platform administrators only: each organization is an isolated tenant (its own events, gates and staff)
export default function AdminOrganizations() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["/api/orgs"],
    queryFn: () => api.listOrgs(),
    enabled: isPlatformAdmin,
  });

  const create = useMutation({
    mutationFn: (n: string) => api.createOrg(n),
    onSuccess: () => {
      toast({ title: "Organization created" });
      setOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["/api/orgs"] });
    },
    onError: (e: any) => toast({ title: "Could not create the organization", description: e.message, variant: "destructive" }),
  });

  if (!isPlatformAdmin) {
    return <p className="text-muted-foreground" data-testid="text-forbidden">Only platform administrators can manage organizations.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Each organization has its own events, gates and staff, isolated from the others</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-org"><Plus className="w-4 h-4 mr-2" />New organization</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription>Create the tenant first, then add its organizers and staff from the Users page.</DialogDescription>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(name.trim());
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
              </div>
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orgs?.map((org: any) => (
            <Card key={org.id} data-testid={`card-org-${org.name}`}>
              <CardHeader>
                <Building2 className="w-6 h-6 text-primary" />
                <CardTitle>{org.name}</CardTitle>
                <CardDescription>Created {new Date(org.createdAt).toLocaleDateString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono text-muted-foreground break-all">{org.id}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
