"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, FileText, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { sendSms } from "@/lib/sms/actions";
import {
  DncConfirmDialog,
  type Warning,
} from "@/components/comms/dnc-confirm-dialog";

export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
}

interface SmsComposerProps {
  prospectId: string;
  prospectName: string | null;
  hasPhone: boolean;
  isDnc: boolean;
  templates?: SmsTemplate[];
}

function segmentsFor(text: string) {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  const segments = Math.max(1, text.length === 0 ? 1 : Math.ceil(text.length / cap));
  return { segments, cap, isUnicode };
}

export function SmsComposer({
  prospectId,
  prospectName,
  hasPhone,
  isDnc,
  templates = [],
}: SmsComposerProps) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<Warning[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const meta = useMemo(() => segmentsFor(body), [body]);
  const charsInSegment = body.length === 0 ? 0 : ((body.length - 1) % meta.cap) + 1;

  // Auto-resize textarea up to 6 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const lineHeight = 24;
    const min = lineHeight * 2;
    const max = lineHeight * 6;
    const next = Math.max(min, Math.min(max, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [body]);

  const send = (acknowledged: Warning[]) => {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await sendSms({
        prospectId,
        body: text,
        acknowledgedWarnings: acknowledged,
      });
      if (!res.ok) {
        if (res.requiresAcknowledgement && res.requiresAcknowledgement.length > 0) {
          setPendingWarnings(res.requiresAcknowledgement);
          setConfirmOpen(true);
          return;
        }
        toast.error(res.error);
        return;
      }
      setBody("");
      setPendingWarnings([]);
      setConfirmOpen(false);
    });
  };

  const handleSend = () => send([]);
  const handleConfirm = () => send(pendingWarnings);

  const insertTemplate = (text: string) => {
    setBody(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(text.length, text.length);
      }
    });
  };

  // segment counter color & ring
  const overLimit = meta.segments >= 6;
  const warning = meta.segments >= 5 && !overLimit;
  const segmentColor = overLimit
    ? "text-destructive"
    : warning
      ? "text-amber-600 dark:text-amber-500"
      : "text-muted-foreground";

  const sendDisabled = !hasPhone || pending || body.trim().length === 0;

  return (
    <div className="space-y-2">
      {!hasPhone && (
        <div className="rounded-lg border-2 border-dashed bg-muted/20 p-3 text-sm text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">No phone number on file</p>
            <p className="text-xs mt-0.5">
              Add a phone number to this prospect before sending SMS.
            </p>
          </div>
        </div>
      )}
      {isDnc && hasPhone && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              On the Do Not Call list
            </p>
            <p className="text-xs mt-0.5 text-amber-800/80 dark:text-amber-300/80">
              You&rsquo;ll be asked to confirm before any message goes out.
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border bg-card transition-shadow",
          "focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/40",
          !hasPhone && "opacity-60",
        )}
      >
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={hasPhone ? "Type a message…" : "Add a phone number first"}
          rows={2}
          className="resize-none border-none focus-visible:ring-0 shadow-none px-4 pt-3 pb-1 text-sm leading-6 bg-transparent"
          disabled={!hasPhone}
          maxLength={1600}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          {/* Counter + segment indicator */}
          <div className="flex items-center gap-2">
            <SegmentDots count={meta.segments} cap={6} />
            <div className={cn("text-xs tabular-nums", segmentColor)}>
              {body.length === 0 ? (
                <span className="text-muted-foreground">{meta.cap} chars per segment</span>
              ) : (
                <>
                  <span className="font-medium">{charsInSegment}</span>
                  <span className="text-muted-foreground">/{meta.cap}</span>
                  <span className="mx-1.5 text-foreground/40">·</span>
                  <span>
                    {meta.segments} {meta.segments === 1 ? "seg" : "segs"}
                  </span>
                  {meta.isUnicode && (
                    <>
                      <span className="mx-1.5 text-foreground/40">·</span>
                      <span>Unicode</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!hasPhone}
                    className="h-8 gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    Templates
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <FileText className="size-3.5" />
                    Insert template
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {templates.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => insertTemplate(t.body)}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {t.body}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sendDisabled}
              className={cn(
                "h-8 gap-1.5 rounded-lg",
                isDnc && !sendDisabled && "bg-amber-600 hover:bg-amber-700",
              )}
              title="Send (⌘/Ctrl + Enter)"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>

      <DncConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        warnings={pendingWarnings}
        prospectName={prospectName}
        onConfirm={handleConfirm}
        busy={pending}
      />
    </div>
  );
}

// Visual segment counter — fills as the user types
function SegmentDots({ count, cap }: { count: number; cap: number }) {
  const dots = Math.min(count, cap);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: cap }).map((_, i) => {
        const filled = i < dots;
        const dangerZone = i >= 4;
        return (
          <span
            key={i}
            className={cn(
              "h-1.5 w-3 rounded-sm transition-colors",
              !filled && "bg-muted",
              filled && !dangerZone && "bg-primary/70",
              filled && dangerZone && i < 5 && "bg-amber-500",
              filled && i >= 5 && "bg-destructive",
            )}
          />
        );
      })}
    </div>
  );
}
