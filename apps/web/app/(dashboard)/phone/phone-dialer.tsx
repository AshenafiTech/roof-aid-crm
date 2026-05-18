"use client";

import { useRef, useState } from "react";
import { Delete, Loader2, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSoftphoneStore } from "@/lib/stores/softphone-store";
import { REMOTE_AUDIO_ID } from "@/components/comms/softphone";

const KEYPAD: Array<{ digit: string; letters?: string }> = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

function formatE164Display(e164: string | null): string {
  if (!e164) return "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function formatAsTyped(input: string): string {
  // Visual formatting for the dial display: groups in 3-3-4 for US, otherwise raw
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  // 11+ digits — likely +1 prefix
  return `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
}

/**
 * Convert user input into a strict E.164 string, or null if ambiguous.
 *
 * Rules:
 *   - "+xxxxxxxxxx" → returned as-is (international, user-specified)
 *   - "00xxxxxxxx"  → "+xxxxxxxx" (00 = international prefix in many countries)
 *   - 10 digits starting with [2-9] → assume US, prefix +1
 *   - 11 digits starting with 1, second digit [2-9] → +US format
 *   - 10 digits starting with 0 or 1 → REJECT (not a valid US area code,
 *     and we won't guess the country — most often Ethiopian local 0xxxxxx
 *     or another local format that needs explicit country code)
 *   - Anything else → null
 */
function normalizeToE164(input: string): string | null {
  const trimmed = input.trim();
  // Already E.164
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 10 ? `+${digits}` : null;
  }
  // 00 international prefix
  if (trimmed.startsWith("00")) {
    const digits = trimmed.replace(/\D/g, "").slice(2);
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  // 11-digit US: 1 + valid area code
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits[1])) {
    return `+${digits}`;
  }
  // 10-digit US — strict: area code MUST start with 2-9
  if (digits.length === 10 && /^[2-9]/.test(digits[0])) {
    return `+1${digits}`;
  }
  // Anything else (including 10-digit starting with 0 or 1) is ambiguous —
  // don't guess. The caller should add a country code.
  return null;
}

export function PhoneDialer() {
  const [number, setNumber] = useState("");
  const { client, status, callerNumber, activeCall, setOutgoingContext } =
    useSoftphoneStore();

  const ready = status === "ready" && !!client;
  const inCall = status === "in_call" || status === "ringing_out";

  const append = (d: string) => setNumber((n) => n + d);
  const backspace = () => setNumber((n) => n.slice(0, -1));
  const clear = () => setNumber("");

  // Long-press on "0" inserts "+", iOS-style. Held >= 500ms.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const startZeroPress = () => {
    longPressFiredRef.current = false;
    longPressTimer.current = setTimeout(() => {
      append("+");
      longPressFiredRef.current = true;
    }, 500);
  };
  const endZeroPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressFiredRef.current) {
      append("0");
    }
  };
  const cancelZeroPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressFiredRef.current = true; // prevent the click handler from firing 0
  };

  const handleCall = () => {
    const e164 = normalizeToE164(number);
    if (!e164) {
      toast.error("Enter a valid phone number (e.g. +14795551234 or 4795551234).");
      return;
    }
    if (!client) {
      toast.error("Softphone is not connected yet.");
      return;
    }
    if (!callerNumber) {
      toast.error(
        "No active number to call from. Set up a primary number in Settings → Phone Numbers.",
      );
      return;
    }
    try {
      client.newCall({
        destinationNumber: e164,
        callerNumber,
        audio: true,
        video: false,
        remoteElement: REMOTE_AUDIO_ID,
      });
      setOutgoingContext({
        prospectId: null,
        prospectName: null,
        destinationNumber: e164,
      });
    } catch (err) {
      console.error("[PhoneDialer] dial failed", err);
      toast.error(err instanceof Error ? err.message : "Could not start the call");
    }
  };

  const handleHangup = () => activeCall?.hangup();

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Dialer card */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-b from-muted/40 to-transparent px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Calling from
              </Label>
              <div className="text-sm font-medium tabular-nums">
                {formatE164Display(callerNumber)}
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Display + edit */}
        <div className="px-5 pt-5 pb-2 space-y-2">
          <Input
            value={formatAsTyped(number)}
            onChange={(e) => {
              // Allow typing too — keep only digits + prefix
              const raw = e.target.value.replace(/[^\d+\s()\-]/g, "");
              setNumber(raw.replace(/[\s()\-]/g, ""));
            }}
            placeholder="Enter number"
            className="h-12 text-2xl font-semibold tabular-nums tracking-wide text-center border-none focus-visible:ring-0 shadow-none"
            disabled={!ready}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCall();
            }}
          />
          {number.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Tap a digit or type a number · Hold <strong>0</strong> for <strong>+</strong>
            </p>
          ) : (
            <DialPreview number={number} />
          )}
        </div>

        {/* Numeric keypad */}
        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {KEYPAD.map((k) => {
              const isZero = k.digit === "0";
              return (
                <button
                  key={k.digit}
                  type="button"
                  disabled={!ready}
                  // For "0", a long-press inserts "+". Tap inserts "0".
                  // For all other keys, a regular click inserts the digit.
                  onClick={isZero ? undefined : () => append(k.digit)}
                  onMouseDown={isZero ? startZeroPress : undefined}
                  onMouseUp={isZero ? endZeroPress : undefined}
                  onMouseLeave={isZero ? cancelZeroPress : undefined}
                  onTouchStart={isZero ? startZeroPress : undefined}
                  onTouchEnd={
                    isZero
                      ? (e) => {
                          e.preventDefault();
                          endZeroPress();
                        }
                      : undefined
                  }
                  onTouchCancel={isZero ? cancelZeroPress : undefined}
                  className={cn(
                    "group flex flex-col items-center justify-center rounded-xl",
                    "h-16 hover:bg-accent active:scale-[0.97]",
                    "border bg-card transition-all select-none",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
                  )}
                >
                  <span className="text-2xl font-semibold tabular-nums leading-none">
                    {k.digit}
                </span>
                {k.letters && (
                  <span className="mt-0.5 text-[10px] tracking-widest text-muted-foreground">
                    {k.letters}
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </div>

        {/* Action row */}
        <div className="px-5 pb-5">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            {inCall ? (
              <Button
                size="lg"
                variant="destructive"
                onClick={handleHangup}
                className="h-14 gap-2 rounded-xl text-base"
              >
                <PhoneOff className="size-5" />
                Hang up
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleCall}
                disabled={!ready || number.length < 7}
                className="h-14 gap-2 rounded-xl text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {status === "connecting" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Phone className="size-5 fill-current" />
                )}
                Call
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              onClick={number ? backspace : undefined}
              disabled={!number || !ready}
              title={number ? "Backspace" : "Empty"}
              className="h-14 w-14 rounded-xl"
            >
              <Delete className="size-5" />
            </Button>
          </div>
          {number.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* Side panel */}
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Active call</h2>
        {!inCall ? (
          <div className="rounded-xl border-2 border-dashed bg-muted/10 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/40">
              <Phone className="size-5 text-muted-foreground/70" />
            </div>
            <p className="mt-3 text-sm font-medium">No call in progress</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Once a call is active, mute / hang-up controls live in the softphone bar at the top of every page.
              Use prospect detail pages for context-aware calls (DNC checks, history, recording).
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 p-6 space-y-2">
            <p className="text-sm font-medium">Connected</p>
            <p className="text-sm text-muted-foreground">
              Mute, hold, and hangup controls are in the softphone bar above.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// Show the user the exact number that will be dialed.  Without this,
// users typing 10 digits get auto-prefixed +1 and may unintentionally
// reach Puerto Rico/Caribbean numbers (area code 939 etc) thinking
// they're calling something else.
const COUNTRY_HINTS: Array<{ prefix: string; label: string; flag: string }> = [
  { prefix: "+1939", label: "Puerto Rico", flag: "🇵🇷" },
  { prefix: "+1787", label: "Puerto Rico", flag: "🇵🇷" },
  { prefix: "+1809", label: "Dominican Rep.", flag: "🇩🇴" },
  { prefix: "+1829", label: "Dominican Rep.", flag: "🇩🇴" },
  { prefix: "+1849", label: "Dominican Rep.", flag: "🇩🇴" },
  { prefix: "+1876", label: "Jamaica", flag: "🇯🇲" },
  { prefix: "+1", label: "United States / Canada", flag: "🇺🇸" },
  { prefix: "+251", label: "Ethiopia", flag: "🇪🇹" },
  { prefix: "+44", label: "United Kingdom", flag: "🇬🇧" },
  { prefix: "+254", label: "Kenya", flag: "🇰🇪" },
  { prefix: "+234", label: "Nigeria", flag: "🇳🇬" },
];

function countryHint(e164: string): { label: string; flag: string } | null {
  for (const h of COUNTRY_HINTS) {
    if (e164.startsWith(h.prefix)) return { label: h.label, flag: h.flag };
  }
  return null;
}

function DialPreview({ number }: { number: string }) {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, "");

  // Specific helpful error for the "Ethiopian local format" gotcha
  if (
    !trimmed.startsWith("+") &&
    !trimmed.startsWith("00") &&
    digits.length === 10 &&
    digits.startsWith("0")
  ) {
    return (
      <p className="text-center text-xs text-amber-600 dark:text-amber-500">
        Local format detected. For Ethiopia, dial <strong>+251</strong> followed by{" "}
        <span className="font-mono">{digits.slice(1)}</span> (drop the leading 0)
      </p>
    );
  }

  const e164 = normalizeToE164(number);
  if (!e164) {
    return (
      <p className="text-center text-xs text-amber-600 dark:text-amber-500">
        Add country code: e.g. <strong>+1</strong> for US, <strong>+251</strong> for Ethiopia
      </p>
    );
  }

  const hint = countryHint(e164);
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      <span className="text-muted-foreground">Will dial</span>
      <span className="font-mono tabular-nums font-semibold">{e164}</span>
      {hint && (
        <span className="text-muted-foreground">
          {hint.flag} {hint.label}
        </span>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof useSoftphoneStore.getState>["status"];
}) {
  const cfg = (() => {
    switch (status) {
      case "ready":
        return { label: "Ready", color: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/30" };
      case "connecting":
        return { label: "Connecting…", color: "text-amber-600 bg-amber-500/10 ring-amber-500/30" };
      case "ringing_out":
        return { label: "Dialing", color: "text-blue-600 bg-blue-500/10 ring-blue-500/30" };
      case "in_call":
        return { label: "On call", color: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/30" };
      case "error":
        return { label: "Error", color: "text-rose-600 bg-rose-500/10 ring-rose-500/30" };
      case "ringing_in":
        return { label: "Incoming", color: "text-blue-600 bg-blue-500/10 ring-blue-500/30" };
      default:
        return { label: "Idle", color: "text-muted-foreground bg-muted/40 ring-border" };
    }
  })();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        cfg.color,
      )}
    >
      <span className="mr-1.5 size-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  );
}
