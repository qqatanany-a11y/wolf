from django.urls import path

from . import views

urlpatterns = [
    path("healthz", views.healthz),
    path("auth/login", views.auth_login),
    path("auth/logout", views.auth_logout),
    path("auth/me", views.auth_me),
    path("auth/change-password", views.change_password),
    path("auth/reset-password", views.reset_password),
    path("dashboard", views.dashboard),
    path("resources", views.resources),
    path("resources/<int:resource_id>", views.resource_detail),
    path("sessions", views.sessions),
    path("sessions/<int:session_id>", views.session_detail),
    path("sessions/<int:session_id>/cafeteria-items", views.session_cafeteria_items),
    path("products", views.products),
    path("products/<int:product_id>", views.product_detail),
    path("orders", views.orders),
    path("orders/<int:order_id>/pay", views.pay_order),
    path("orders/<int:order_id>/items", views.order_items),
    path("reports/profit", views.profit_report),
    path("reports/audit", views.audit_log),
]
