from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path

urlpatterns = [
    path("api/", include("club.urls")),
]


def serve_frontend(request, *args, **kwargs):
    if not settings.FRONTEND_INDEX.exists():
        return HttpResponseNotFound(
            "Frontend build not found. Run the React build before deploying."
        )
    return FileResponse(open(settings.FRONTEND_INDEX, "rb"))


urlpatterns += [re_path(r"^(?!api/).*$", serve_frontend)]
