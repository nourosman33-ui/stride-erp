import Link from "next/link";
import { Store } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function NoStoreSelected() {
  return (
    <Alert>
      <Store />
      <AlertTitle>No store yet</AlertTitle>
      <AlertDescription>
        <p>This view is scoped to a store, and none exist yet. Create one to continue.</p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/settings/store">Create a store</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
