-- ============================================================
-- ROOF-AID CRM — Milestone 5 Step 2
-- transition_appointment RPC — single code path for appointment
-- status changes, shared by web (Stage 2) and mobile (Stage 9).
-- Contract: docs/milestone5/web-dependencies-for-mobile.md §3.3
-- Matrix:   docs/milestone5/stage-2-calendar-and-status.md §3
-- ============================================================

CREATE OR REPLACE FUNCTION transition_appointment(
  p_appointment_id uuid,
  p_to             text,
  p_reason         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role          text := public.get_user_role();
  v_caller_tenant uuid := public.get_tenant_id();
  v_uid           uuid := auth.uid();
  v_appt          appointments%ROWTYPE;
  v_allowed       boolean;
  v_role_ok       boolean;
BEGIN
  IF p_to NOT IN ('confirmed','cancelled','completed','no_show','rescheduled') THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_transition',
        'message', format('Unknown target status: %s', p_to)));
  END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Appointment not found'));
  END IF;

  -- Tenant guard.
  IF v_appt.tenant_id <> v_caller_tenant
     AND v_role <> 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Cross-tenant access denied'));
  END IF;

  -- Ownership: a rufero can only transition their own appointments.
  IF v_role = 'rufero' AND v_appt.rufero_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden','message','Not your appointment'));
  END IF;

  -- Per-role transition matrix (stage-2 §3).
  v_role_ok := CASE p_to
    WHEN 'confirmed'   THEN v_role IN ('telefonista','admin','owner','super_admin')
    WHEN 'cancelled'   THEN v_role IN ('telefonista','admin','owner','super_admin')
    WHEN 'completed'   THEN v_role IN ('rufero','admin','owner','super_admin')
    WHEN 'no_show'     THEN v_role IN ('rufero','admin','owner','super_admin')
    WHEN 'rescheduled' THEN v_role IN ('telefonista','admin','owner','super_admin')
  END;

  IF NOT v_role_ok THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden',
        'message', format('Role %s cannot move appointment to %s', v_role, p_to)));
  END IF;

  -- Allowed source → target transitions.
  v_allowed := CASE
    WHEN v_appt.status = 'pending'   AND p_to IN ('confirmed','cancelled','rescheduled') THEN true
    WHEN v_appt.status = 'confirmed' AND p_to IN ('completed','no_show','cancelled','rescheduled') THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_transition',
        'message', format('Cannot move %s → %s', v_appt.status, p_to)));
  END IF;

  -- Reason required for cancellation / no-show.
  IF p_to IN ('cancelled','no_show') AND coalesce(btrim(p_reason),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','reason_required',
        'message','A reason is required for this transition'));
  END IF;

  UPDATE appointments
     SET status              = p_to,
         cancellation_reason = CASE WHEN p_to IN ('cancelled','no_show')
                                    THEN p_reason
                                    ELSE cancellation_reason END,
         updated_at          = now()
   WHERE id = p_appointment_id;

  -- Side effects on the prospect (stage-2 §3).
  IF p_to = 'completed' THEN
    UPDATE prospects
       SET status = 'inspected', updated_at = now()
     WHERE id = v_appt.prospect_id
       AND status = 'scheduled';
  ELSIF p_to IN ('cancelled','no_show') THEN
    UPDATE prospects
       SET status = 'contacted', updated_at = now()
     WHERE id = v_appt.prospect_id
       AND status = 'scheduled';
  END IF;

  -- Activity log — non-fatal; ignore failures so the transition still succeeds.
  BEGIN
    INSERT INTO activities (tenant_id, prospect_id, user_id, type, metadata)
    VALUES (
      v_appt.tenant_id,
      v_appt.prospect_id,
      v_uid,
      'appointment_status_change',
      jsonb_build_object(
        'appointment_id', v_appt.id,
        'from', v_appt.status,
        'to', p_to,
        'reason', p_reason
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION transition_appointment(uuid, text, text) TO authenticated;
