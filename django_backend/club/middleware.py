from django.http import JsonResponse


PUBLIC_API_PATHS = {
    "/api/healthz",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/reset-password",
}
PASSWORD_CHANGE_PATH = "/api/auth/change-password"


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
        return self.get_response(request)
