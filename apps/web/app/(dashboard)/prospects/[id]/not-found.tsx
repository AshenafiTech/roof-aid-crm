import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export default function ProspectNotFound() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospect not found"
        description="This prospect doesn't exist or you don't have access."
      />
      <Button asChild variant="outline">
        <Link href="/prospects">Back to prospects</Link>
      </Button>
    </div>
  );
}
