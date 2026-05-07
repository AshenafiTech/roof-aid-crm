"use client";

import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  NumberPickerForm,
  formatE164,
} from "@/components/shared/number-picker-form";

import { purchaseAndAttachNumber, searchNumbers } from "./actions";

export function NumberPicker() {
  const router = useRouter();

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="size-5" />
          Pick your business line
        </CardTitle>
        <CardDescription>
          Roof-Aid will get you a dedicated phone number that homeowners
          can call and text. You can add more numbers later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NumberPickerForm
          searchAction={searchNumbers}
          purchaseAction={purchaseAndAttachNumber}
          submitLabel="Buy & continue"
          successToast={(e164) =>
            `Number ${formatE164(e164)} is now your business line.`
          }
          onSuccess={() => router.refresh()}
        />
      </CardContent>
    </Card>
  );
}
