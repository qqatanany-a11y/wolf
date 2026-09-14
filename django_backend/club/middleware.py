from django.http import JsonResponse


PUBLIC_API_PATHS = {
    "/api/healthz",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/reset-password",
}
PASSWORD_CHANGE_PATH = "/api/auth/change-password"
REPORTS_PATH_PREFIX = "/api/reports/"
MANAGEMENT_PATH_PREFIXES = ("/api/resources", "/api/products")


class ClubApiAuthenticationMiddleware:
    """Keep operational endpoints private while leaving authentication available."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/") or request.path in PUBLIC_API_PATHS:
            return self.get_response(request)

        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        if request.path != PASSWORD_CHANGE_PATH and request.session.get("must_change_password"):
            return JsonResponse(
                {"error": "Password change required", "mustChangePassword": True},
                status=403,
            )

        # The floor staff account can operate the club, but cannot view financial
        # reports or change the club configuration.  Keep this server-side so a
        # manually entered URL or API request cannot bypass the UI.
        if request.user.username == "yazan":
            is_management_change = (
                request.path.startswith(MANAGEMENT_PATH_PREFIXES)
                and request.method != "GET"
            )
            if request.path.startswith(REPORTS_PATH_PREFIX) or is_management_change:
                return JsonResponse({"error": "You do not have permission to access this page"}, status=403)
        return self.get_response(request)
