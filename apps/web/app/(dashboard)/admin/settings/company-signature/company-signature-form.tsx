"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Eraser, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  clearCompanySignature,
  saveCompanySignature,
} from "./actions";

interface Initial {
  configured: boolean;
  signerName: string | null;
  updatedAt: string | null;
  previewUrl: string | null;
}

export function CompanySignatureForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [signerName, setSignerName] = useState(initial.signerName ?? "");
  const [pending, start] = useTransition();
  const [hasSig, setHasSig] = useState(false);

  function handleClear() {
    sigRef.current?.clear();
    setHasSig(false);
  }

  function save() {
    if (!signerName.trim()) {
      toast.error("Add the printed name that should appear under the signature");
      return;
    }
    const canvas = sigRef.current;
    if (!canvas || canvas.isEmpty()) {
      toast.error("Draw a signature first");
      return;
    }
    const dataUrl = canvas.getTrimmedCanvas().toDataURL("image/png");
    const pngBase64 = dataUrl.split(",")[1] ?? "";
    start(async () => {
      try {
        await saveCompanySignature({
          pngBase64,
          signerName: signerName.trim(),
        });
        toast.success("Company signature saved");
        sigRef.current?.clear();
        setHasSig(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function clearAll() {
    if (!confirm("Remove the saved company signature? Documents already generated keep theirs; only future documents are affected.")) {
      return;
    }
    start(async () => {
      try {
        await clearCompanySignature();
        toast.success("Company signature cleared");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Clear failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {initial.configured && initial.previewUrl && (
        <Card className="space-y-3 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium">Currently saved</p>
                <p className="text-xs text-muted-foreground">
                  Signed as{" "}
                  <span className="font-medium text-foreground">
                    {initial.signerName}
                  </span>
                  {initial.updatedAt
                    ? ` · updated ${new Date(initial.updatedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={pending}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          </div>
          <div className="rounded-md border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initial.previewUrl}
              alt="Current company signature"
              className="max-h-32"
            />
          </div>
        </Card>
      )}

      <Card className="space-y-4 px-5 py-4">
        <div>
          <h2 className="text-base font-medium">
            {initial.configured ? "Replace signature" : "Add signature"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Sign in the box below. The image will appear on every new
            document at the Representative line — homeowner only needs to
            add theirs.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signer-name">Printed name</Label>
          <Input
            id="signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Jane Doe"
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label>Signature</Label>
          <div className="rounded-md border bg-white">
            <SignatureCanvas
              ref={(r) => {
                sigRef.current = r;
              }}
              penColor="#111111"
              canvasProps={{
                className: "w-full h-48 rounded-md",
              }}
              onEnd={() => setHasSig(true)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={pending || !hasSig}
          >
            <Eraser className="mr-1 h-4 w-4" /> Clear pad
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save signature
          </Button>
        </div>
      </Card>
    </div>
  );
}
