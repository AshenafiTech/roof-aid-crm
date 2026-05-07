// Shared Telnyx types used across the wrapper and its callers.

export type Capability = 'voice' | 'sms' | 'mms'

export interface AvailableNumber {
  e164: string
  city: string | null
  region: string // e.g. "AR"
  monthly_cost_usd: number
  capabilities: Capability[]
}

export interface PurchasedNumber {
  telnyx_number_id: string
  e164: string
  capabilities: Capability[]
  messaging_profile_id: string | null
  voice_app_id: string | null
}

export interface SearchOpts {
  areaCode: string
  features?: Capability[]
  limit?: number
}

export interface SendSmsOpts {
  from: string // e164 of one of the tenant's numbers
  to: string
  text: string
}

export interface InitiateCallOpts {
  from: string
  to: string
  agentExtension: string // SIP extension to bridge into
}
