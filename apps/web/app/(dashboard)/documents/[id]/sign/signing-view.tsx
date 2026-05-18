"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowLeft, Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signDocument } from "@/app/(dashboard)/documents/actions";

// react-pdf is loaded lazily — it pulls in pdf.js at module-init and
// references DOMMatrix / canvas types that don't exist during SSR.
const PdfPreview = dynamic(() => import("./pdf-preview").then((m) => m.PdfPreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading preview…
    </div>
  ),
});

/**
 * Web signing surface — used ONLY for the company representative sign.
 * The homeowner signs from the mobile app once the doc is at
 * status='awaiting_homeowner_signature'.
 */
export function SigningView({
  documentId,
  pdfUrl,
  prospectName,
  backHref,
  defaultSignerName,
}: {
  documentId: string;
  pdfUrl: string | null;
  prospectName: string;
  backHref: string;
  defaultSignerName: string;
}) {
  const router = useRouter();
  const padRef = useRef<SignatureCanvas | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pending, start] = useTransition();

  function clear() {
    padRef.current?.clear();
    setHasDrawn(false);
  }

  function submit() {
    if (!padRef.current || padRef.current.isEmpty()) {
      toast.error("Draw a signature first");
      return;
    }
    if (!signerName.trim()) {
      toast.error("Type your printed name");
      return;
    }
    const trimmed = padRef.current.getTrimmedCanvas();
    const dataUrl = trimmed.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];

    start(async () => {
      try {
        await signDocument({
          documentId,
          signaturePngBase64: base64,
          signerName: signerName.trim(),
          signerRole: "company",
        });
        toast.success("Signed as company representative");
        router.push(`/documents/${documentId}?just_signed=1`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Signing failed");
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-110px)] flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
        >
          <Link href={backHref}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1 truncate text-sm font-medium">
          Signing for {prospectName}
        </div>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
          Company line
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
        {pdfUrl ? (
          <PdfPreview url={pdfUrl} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Couldn't load preview. The document may have been moved.
          </div>
        )}
      </div>

      <div className="border-t bg-background p-4">
        <div className="space-y-2">
          <Label htmlFor="signer-name">Printed name</Label>
          <Input
            id="signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="mt-3">
          <Label className="mb-1.5 block">Company representative signature</Label>
          <div className="relative rounded-md border bg-white">
            <SignatureCanvas
              ref={(r) => {
                padRef.current = r;
              }}
              penColor="#1F2937"
              canvasProps={{
                className: "h-32 w-full",
              }}
              onEnd={() => {
                setHasDrawn(!padRef.current?.isEmpty());
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            After you sign, the document waits for the homeowner to sign
            from the mobile app.
          </p>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={clear} disabled={pending || !hasDrawn}>
            <Eraser className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !hasDrawn || !signerName.trim()}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Signing…
              </>
            ) : (
              "Confirm & sign"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
