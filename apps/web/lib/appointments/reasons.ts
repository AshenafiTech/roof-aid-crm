export function humanReasonFor(reason: string): string {
  switch (reason) {
    case "overlap":
      return "This rufero already has an overlapping appointment (incl. 2h travel buffer).";
    case "overlap_with_block":
      return "This rufero has a blocked time range covering this slot.";
    case "outside_working_hours":
      return "Outside this rufero's working hours.";
    case "rufero_inactive":
      return "This rufero is currently inactive.";
    case "rufero_not_found":
      return "Rufero not found.";
    case "forbidden":
      return "Not allowed.";
    default:
      return "Slot unavailable.";
  }
}
