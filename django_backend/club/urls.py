from django.urls import path

from . import views

urlpatterns = [
    path("healthz", views.healthz),
    path("dashboard", views.dashboard),
    path("resources", views.resources),
    path("resources/<int:resource_id>", views.resource_detail),
    path("sessions", views.sessions),
    path("sessions/<int:session_id>", views.session_detail),
    path("products", views.products),
    path("orders", views.orders),
    path("orders/<int:order_id>/pay", views.pay_order),
    path("reports/profit", views.profit_report),
]