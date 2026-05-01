// Softphone client + state, shared across the dashboard.
//
// The <Softphone /> bar owns the lifecycle (connect on mount, disconnect on
// unmount). Other components — most notably <CallButton /> on prospect
// cards — read state from here and call `dial()` to start outbound calls.

"use client";

import { create } from "zustand";
import type { TelnyxRTC } from "@telnyx/webrtc";

export type SoftphoneStatus =
  | "idle" // not yet connected (initial mount)
  | "connecting" // fetching credentials / opening WebRTC
  | "ready" // logged in, no active call
  | "ringing_in" // inbound call, awaiting accept
  | "ringing_out" // outbound call, dialing
  | "in_call" // call active, audio flowing
  | "error"; // unrecoverable; user needs to retry

// We keep the call object as `unknown` here to avoid leaking SDK types
// into modules that don't import @telnyx/webrtc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TelnyxCall = any;

interface IncomingCall {
  callerNumber: string | null;
  callId: string;
  call: TelnyxCall;
}

interface OutgoingCallContext {
  prospectId: string | null;
  prospectName: string | null;
  destinationNumber: string;
}

interface SoftphoneState {
  client: TelnyxRTC | null;
  status: SoftphoneStatus;
  errorMessage: string | null;
  callerNumber: string | null; // tenant's primary number, used as caller ID
  activeCall: TelnyxCall | null;
  incoming: IncomingCall | null;
  outgoingContext: OutgoingCallContext | null;
  micMuted: boolean;

  // Mutators called from the Softphone component
  setClient(client: TelnyxRTC | null): void;
  setStatus(status: SoftphoneStatus, errorMessage?: string | null): void;
  setCallerNumber(e164: string | null): void;
  setIncoming(call: IncomingCall | null): void;
  setActiveCall(call: TelnyxCall | null): void;
  setOutgoingContext(ctx: OutgoingCallContext | null): void;
  setMicMuted(muted: boolean): void;
  reset(): void;
}

const initialState = {
  client: null,
  status: "idle" as SoftphoneStatus,
  errorMessage: null,
  callerNumber: null,
  activeCall: null,
  incoming: null,
  outgoingContext: null,
  micMuted: false,
};

export const useSoftphoneStore = create<SoftphoneState>((set) => ({
  ...initialState,

  setClient: (client) => set({ client }),
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  setCallerNumber: (callerNumber) => set({ callerNumber }),
  setIncoming: (incoming) => set({ incoming }),
  setActiveCall: (activeCall) => set({ activeCall }),
  setOutgoingContext: (outgoingContext) => set({ outgoingContext }),
  setMicMuted: (micMuted) => set({ micMuted }),

  reset: () => set({ ...initialState }),
}));
