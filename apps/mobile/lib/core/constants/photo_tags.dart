/// Canonical photo tags for inspection photos.
///
/// Must match the DB strings stored in `photos.tags`. Locked in
/// `docs/milestone5/web-dependencies-for-mobile.md` §3.2.
class PhotoTags {
  static const String overview = 'overview';
  static const String front = 'front';
  static const String back = 'back';
  static const String leftSide = 'left_side';
  static const String rightSide = 'right_side';
  static const String closeUpDamage = 'close_up_damage';
  static const String gutters = 'gutters';
  static const String chimney = 'chimney';
  static const String skylights = 'skylights';
  static const String hvac = 'hvac';
  static const String siding = 'siding';
  static const String evidence = 'evidence';
  static const String other = 'other';

  static const List<String> all = [
    overview,
    front,
    back,
    leftSide,
    rightSide,
    closeUpDamage,
    gutters,
    chimney,
    skylights,
    hvac,
    siding,
    evidence,
    other,
  ];

  /// Grouped for the tag picker — saves rufero a long scan.
  static const Map<String, List<String>> groups = {
    'Exterior': [overview, front, back, leftSide, rightSide],
    'Damage focus': [closeUpDamage, evidence],
    'Components': [gutters, chimney, skylights, hvac, siding],
    'Other': [other],
  };

  static String label(String tag) {
    switch (tag) {
      case overview:
        return 'Overview';
      case front:
        return 'Front';
      case back:
        return 'Back';
      case leftSide:
        return 'Left side';
      case rightSide:
        return 'Right side';
      case closeUpDamage:
        return 'Close-up damage';
      case gutters:
        return 'Gutters';
      case chimney:
        return 'Chimney';
      case skylights:
        return 'Skylights';
      case hvac:
        return 'HVAC';
      case siding:
        return 'Siding';
      case evidence:
        return 'Evidence';
      case other:
        return 'Other';
      default:
        return tag;
    }
  }
}
