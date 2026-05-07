"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Radio,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSoftphoneStore } from "@/lib/stores/softphone-store";

// ID of the hidden <audio> element the SDK pipes remote audio into. Has
// to be in the DOM at all times so calls don't connect to a black hole.
// Same constant is used by other call-initiating surfaces.
export const REMOTE_AUDIO_ID = "roof-aid-remote-audio";

/**
 * Attach the active call's remote MediaStream to the hidden <audio> element
 * so audio actually plays. Required for inbound; redundant-but-safe for
 * outbound (newCall's remoteElement option already does this).
 *
 * Telnyx SDK exposes the remote stream in slightly different ways across
 * versions — we probe several known paths.
 */
function attachRemoteAudio(call: unknown): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(REMOTE_AUDIO_ID) as HTMLAudioElement | null;
  if (!el) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = call as any;
  const stream: MediaStream | undefined =
    c?.remoteStream ??
    c?.peer?.instance?.getRemoteStreams?.()?.[0] ??
    c?.options?.remoteStream;

  if (stream && el.srcObject !== stream) {
    el.srcObject = stream;
    void el.play().catch((err) => {
      // Browser autoplay policies may block; user gesture during call accept
      // typically unlocks it. Log so we can diagnose if it doesn't.
      console.warn("[softphone] audio.play() blocked:", err);
    });
  }
}

function formatE164(e164: string | null | undefined): string {
  if (!e164) return "Unknown";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function initialsFromNumber(e164: string | null | undefined): string {
  if (!e164) return "?";
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-2);
}

/** mm:ss timer that ticks once per second */
function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function Softphone() {
  const {
    status,
    errorMessage,
    callerNumber,
    activeCall,
    incoming,
    outgoingContext,
    micMuted,
    setClient,
    setStatus,
    setCallerNumber,
    setIncoming,
    setActiveCall,
    setOutgoingContext,
    setMicMuted,
    reset,
  } = useSoftphoneStore();

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRanRef = useRef(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);

  // Tick call duration once a second while in_call
  useEffect(() => {
    if (status !== "in_call" || !callStartedAt) {
      setDuration(0);
      return;
    }
    const id = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status, callStartedAt]);

  // Initialize the SDK once on mount
  useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;

    let cancelled = false;
    let client: import("@telnyx/webrtc").TelnyxRTC | null = null;

    async function init() {
      setStatus("connecting");
      try {
        const res = await fetch("/api/telnyx/credentials", { method: "POST" });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        const {
          sip_username,
          sip_password,
          caller_number,
          ttl_seconds,
        }: {
          sip_username: string;
          sip_password: string;
          caller_number: string | null;
          ttl_seconds: number;
        } = await res.json();
        if (cancelled) return;

        const { TelnyxRTC } = await import("@telnyx/webrtc");
        client = new TelnyxRTC({
          login: sip_username,
          password: sip_password,
        });

        client.on("telnyx.ready", () => {
          if (cancelled) return;
          setStatus("ready");
        });
        client.on("telnyx.error", (err: unknown) => {
          if (cancelled) return;
          console.error("[softphone] telnyx.error", err);
          setStatus("error", "Connection failed — see console");
        });
        client.on("telnyx.socket.close", () => {
          if (cancelled) return;
          setStatus("error", "Lost connection — refresh to reconnect");
        });
        client.on("telnyx.notification", (notification: unknown) => {
          if (cancelled) return;
          handleNotification(notification);
        });

        await client.connect();
        setClient(client);
        setCallerNumber(caller_number);

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(
          () => {
            void client?.disconnect();
            initRanRef.current = false;
            setTimeout(() => init(), 500);
          },
          Math.floor(ttl_seconds * 1000 * 0.8),
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[softphone] init failed", err);
        setStatus(
          "error",
          err instanceof Error ? err.message : "Failed to start softphone",
        );
      }
    }

    function handleNotification(notification: unknown) {
      const n = notification as { type?: string; call?: { state: string; direction: string; id: string; options?: { remoteCallerNumber?: string }; remoteCallerNumber?: string } };
      if (n.type !== "callUpdate" || !n.call) return;
      const call = n.call;
      const state = call.state;
      const direction = call.direction;

      switch (state) {
        case "ringing":
          if (direction === "inbound") {
            const fromNumber = call.options?.remoteCallerNumber ?? call.remoteCallerNumber ?? null;
            setIncoming({ callerNumber: fromNumber, callId: call.id, call });
            setStatus("ringing_in");
          } else {
            setStatus("ringing_out");
            setActiveCall(call);
          }
          break;
        case "trying":
        case "early":
          if (direction === "outbound") setStatus("ringing_out");
          break;
        case "active":
          setStatus("in_call");
          setActiveCall(call);
          setIncoming(null);
          setCallStartedAt(Date.now());
          // Belt-and-suspenders: pipe the remote MediaStream to our
          // hidden <audio> element manually. This is necessary for
          // inbound calls (where remoteElement can't be passed via
          // newCall) and harmless for outbound (already piped by SDK).
          attachRemoteAudio(call);
          break;
        case "hangup":
        case "destroy":
        case "purge":
          setActiveCall(null);
          setIncoming(null);
          setOutgoingContext(null);
          setMicMuted(false);
          setCallStartedAt(null);
          setStatus("ready");
          break;
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void client?.disconnect();
      reset();
      initRanRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptInbound = () => incoming?.call?.answer();
  const rejectInbound = () => {
    incoming?.call?.hangup();
    setIncoming(null);
    setStatus("ready");
  };
  const hangupActive = () => activeCall?.hangup();
  const toggleMute = () => {
    if (!activeCall) return;
    if (micMuted) {
      activeCall.unmuteAudio();
      setMicMuted(false);
    } else {
      activeCall.muteAudio();
      setMicMuted(true);
    }
  };

  if (status === "idle") return null;

  // Active-call peer name/number for the bar
  const peerLabel =
    outgoingContext?.prospectName ??
    (outgoingContext?.destinationNumber && formatE164(outgoingContext.destinationNumber)) ??
    (incoming?.callerNumber && formatE164(incoming.callerNumber)) ??
    "Unknown";

  return (
    <>
      {/* Hidden audio sink — Telnyx SDK pipes the remote stream here.
          Must be present in the DOM whenever the SDK is connected, or
          calls connect silently with no audible audio. */}
      <audio id={REMOTE_AUDIO_ID} autoPlay playsInline className="hidden" />

      {/* Persistent status bar */}
      <div
        className={cn(
          "sticky top-14 z-30 border-b backdrop-blur-md transition-colors",
          status === "in_call"
            ? "bg-gradient-to-r from-emerald-50/80 via-emerald-50/40 to-transparent dark:from-emerald-950/30 dark:via-emerald-950/10"
            : status === "ringing_in" || status === "ringing_out"
              ? "bg-gradient-to-r from-blue-50/80 via-blue-50/40 to-transparent dark:from-blue-950/30 dark:via-blue-950/10"
              : status === "error"
                ? "bg-gradient-to-r from-rose-50/80 via-rose-50/40 to-transparent dark:from-rose-950/30 dark:via-rose-950/10"
                : "bg-background/95 supports-[backdrop-filter]:bg-background/60",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-2 text-sm">
          <StatusIndicator status={status} />

          <div className="flex-1 min-w-0">
            {status === "connecting" && (
              <span className="text-muted-foreground">Softphone connecting…</span>
            )}
            {status === "ready" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Ready</span>
                <span className="text-foreground/40">·</span>
                <span className="tabular-nums">From {formatE164(callerNumber)}</span>
              </div>
            )}
            {status === "ringing_in" && (
              <div className="flex items-center gap-2 font-medium">
                <span>Incoming</span>
                <span className="tabular-nums">
                  {formatE164(incoming?.callerNumber ?? null)}
                </span>
              </div>
            )}
            {status === "ringing_out" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Calling</span>
                <span className="font-medium text-foreground truncate">{peerLabel}</span>
                <span className="animate-pulse text-foreground/60">…</span>
              </div>
            )}
            {status === "in_call" && (
              <div className="flex items-center gap-2.5">
                <span className="font-medium truncate">{peerLabel}</span>
                <span className="text-foreground/40">·</span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                  {formatDuration(duration)}
                </span>
              </div>
            )}
            {status === "error" && (
              <span className="text-destructive font-medium">
                {errorMessage ?? "Softphone error"}
              </span>
            )}
          </div>

          {/* Active call controls */}
          {status === "in_call" && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={micMuted ? "destructive" : "outline"}
                onClick={toggleMute}
                className="h-8 gap-1.5"
              >
                {micMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                {micMuted ? "Muted" : "Mute"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={hangupActive}
                className="h-8 gap-1.5"
              >
                <PhoneOff className="size-3.5" />
                End
              </Button>
            </div>
          )}

          {status === "ringing_out" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={hangupActive}
              className="h-8 gap-1.5"
            >
              <PhoneOff className="size-3.5" />
              Cancel
            </Button>
          )}

          {status === "error" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="h-8"
            >
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Inbound call modal — center-screen, prominent */}
      {status === "ringing_in" && incoming && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm pt-20 sm:pt-0 px-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-call-title"
        >
          <div className="relative w-full max-w-sm rounded-2xl border bg-background shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
            {/* Soft pulse ring around avatar */}
            <div className="flex justify-center pt-2">
              <div className="relative">
                <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                <div className="relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-semibold tabular-nums">
                  {initialsFromNumber(incoming.callerNumber)}
                </div>
              </div>
            </div>

            <div className="space-y-1 text-center">
              <div
                id="incoming-call-title"
                className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                <PhoneIncoming className="size-3.5" />
                Incoming call
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatE164(incoming.callerNumber)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                onClick={rejectInbound}
                variant="outline"
                className="h-14 text-base gap-2 border-destructive/50 text-destructive hover:bg-destructive/5"
              >
                <PhoneOff className="size-5" />
                Decline
              </Button>
              <Button
                size="lg"
                onClick={acceptInbound}
                className="h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Phone className="size-5" />
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Status indicator (left of the status text)

type StatusKind = ReturnType<typeof useSoftphoneStore.getState>["status"];

function StatusIndicator({ status }: { status: StatusKind }) {
  if (status === "error") {
    return <AlertCircle className="size-4 text-destructive shrink-0" aria-label="error" />;
  }
  if (status === "connecting") {
    return (
      <WifiOff
        className="size-4 text-muted-foreground animate-pulse shrink-0"
        aria-label="connecting"
      />
    );
  }
  if (status === "in_call") {
    return (
      <span className="relative flex shrink-0 size-2.5" aria-label="in call">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 animate-ping" />
        <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
      </span>
    );
  }
  if (status === "ringing_in" || status === "ringing_out") {
    return (
      <span className="relative flex shrink-0 size-2.5" aria-label={status}>
        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500/60 animate-ping" />
        <span className="relative inline-flex rounded-full size-2.5 bg-blue-500" />
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="relative flex shrink-0 size-2.5" aria-label="ready">
        <Radio className="hidden" />
        <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
      </span>
    );
  }
  return <span className="size-2.5 rounded-full bg-muted-foreground/40 shrink-0" />;
}
