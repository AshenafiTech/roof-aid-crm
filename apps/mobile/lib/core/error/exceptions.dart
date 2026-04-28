class ServerException implements Exception {
  final String message;
  ServerException(this.message);
}

class CacheException implements Exception {
  final String message;
  CacheException(this.message);
}

/// Thrown when a request fails because the device is offline or DNS / the
/// server is unreachable. Distinct from [ServerException] so the UI can show
/// a "no internet" affordance instead of a generic error.
class NetworkException implements Exception {
  final String message;
  NetworkException(this.message);
}
