// Webhook handlers don't need permissive CORS — providers POST from
// known servers. But during local testing it's useful to expose this
// constant in case anyone fronts a webhook through a browser tool.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp, x-twilio-email-event-webhook-signature, x-twilio-email-event-webhook-timestamp',
}
