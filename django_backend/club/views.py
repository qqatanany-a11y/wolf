import json
import hmac
from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Prefetch
from django.http import HttpResponse, JsonResponse
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import AccountSecurity, AuditLog, Order, Product, Resource, PlayingSession
from .models_order_items import OrderItem

MONEY = Decimal("0.01")
CLUB_USERNAMES = {"mazen", "ahmed", "yazan"}


def money(value):
    return float(Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP))


def body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return {}


def error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def audit(request, action, subject):
    AuditLog.objects.create(actor=request.user, action=action, subject=subject)


def account_json(request):
    return {
        "username": request.user.username,
        "mustChangePassword": bool(request.session.get("must_change_password")),
    }


def ensure_club_accounts():
    """Provision the three permitted admin accounts on their first use."""
    for username in CLUB_USERNAMES:
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"is_staff": True, "is_superuser": True},
        )
        security, security_created = AccountSecurity.objects.get_or_create(
            user=user, defaults={"force_password_change": True}
        )
        if created or security_created:
            user.set_password(settings.CLUB_INITIAL_PASSWORD)
            user.save(update_fields=["password"])


@csrf_exempt
def auth_login(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    username = str(data.get("username", "")).strip().lower()
    password = str(data.get("password", ""))
    if username not in CLUB_USERNAMES or not password:
        return error("Invalid username or password", 401)
    ensure_club_accounts()
    user = authenticate(request, username=username, password=password)
    if user is None or user.username not in CLUB_USERNAMES:
        return error("Invalid username or password", 401)
    login(request, user)
    security, _ = AccountSecurity.objects.get_or_create(user=user)
    request.session["must_change_password"] = security.force_password_change
    return JsonResponse(account_json(request))


@csrf_exempt
def auth_logout(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    logout(request)
    return HttpResponse(status=204)


def auth_me(request):
    if not request.user.is_authenticated or request.user.username not in CLUB_USERNAMES:
        return error("Authentication required", 401)
    return JsonResponse(account_json(request))


@csrf_exempt
def change_password(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    if not request.user.is_authenticated or request.user.username not in CLUB_USERNAMES:
        return error("Authentication required", 401)
    data = body(request)
    current_password = str(data.get("currentPassword", ""))
    new_password = str(data.get("newPassword", ""))
    if not request.user.check_password(current_password):
        return error("Current password is incorrect", 400)
    if len(new_password) < 8:
        return error("New password must be at least 8 characters", 400)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    AccountSecurity.objects.update_or_create(
        user=request.user, defaults={"force_password_change": False}
    )
    request.session["must_change_password"] = False
    return JsonResponse(account_json(request))


@csrf_exempt
def reset_password(request):
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    username = str(data.get("username", "")).strip().lower()
    recovery_code = str(data.get("recoveryCode", ""))
    configured_code = settings.CLUB_PASSWORD_RESET_CODE
    new_password = str(data.get("newPassword", ""))
    if username not in CLUB_USERNAMES or not configured_code or not hmac.compare_digest(recovery_code, configured_code):
        return error("Invalid account or recovery code", 400)
    if len(new_password) < 8:
        return error("New password must be at least 8 characters", 400)
    ensure_club_accounts()
    user = User.objects.get(username=username)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    AccountSecurity.objects.update_or_create(user=user, defaults={"force_password_change": False})
    return JsonResponse({"message": "Password reset successfully"})


def healthz(request):
    return JsonResponse({"status": "ok"})


def refresh_overdue():
    now = timezone.now()
    PlayingSession.objects.filter(
        status="active", mode="limited", ends_at__lt=now, ended_at__isnull=True
    ).update(status="overdue")


def session_json(session):
    now = timezone.now()
    elapsed = session.elapsed_seconds
    session_total = session.total
    remaining = None
    if session.ends_at:
        remaining = int((session.ends_at - now).total_seconds())
    cafeteria_orders = list(session.orders.prefetch_related("items__product").all())
    cafeteria_total = sum((order.subtotal for order in cafeteria_orders), Decimal("0.00"))
    return {
        "id": session.id,
        "resourceId": session.resource_id,
        "resourceName": session.resource.name,
        "resourceKind": session.resource.kind,
        "status": session.status,
        "mode": session.mode,
        "startedAt": session.started_at.isoformat(),
        "endedAt": session.ended_at.isoformat() if session.ended_at else None,
        "pausedAt": session.paused_at.isoformat() if session.paused_at else None,
        "endsAt": session.ends_at.isoformat() if session.ends_at else None,
        "durationMinutes": session.duration_minutes,
        "elapsedSeconds": elapsed,
        "remainingSeconds": remaining,
        "hourlyRate": money(session.resource.hourly_rate),
        "total": money(session_total),
        "cafeteriaTotal": money(cafeteria_total),
        "grandTotal": money(session_total + cafeteria_total),
        "cafeteriaOrderCount": len(cafeteria_orders),
        "cafeteriaOrders": [order_json(order) for order in cafeteria_orders],
        "paymentStatus": session.payment_status,
        "paymentMethod": session.payment_method,
        "createdBy": session.created_by.username if session.created_by else "System",
        "completedBy": session.completed_by.username if session.completed_by else "System",
    }


def resource_json(resource):
    active = (
        resource.sessions.filter(ended_at__isnull=True)
        .order_by("-started_at")
        .first()
    )
    status = "available"
    if active:
        status = "overdue" if active.status == "overdue" else "active"
    return {
        "id": resource.id,
        "name": resource.name,
        "kind": resource.kind,
        "status": status,
        "hourlyRate": money(resource.hourly_rate),
        "activeSessionId": active.id if active else None,
        "activeSessionStartedAt": active.started_at.isoformat() if active else None,
        "activeSessionEndsAt": active.ends_at.isoformat() if active and active.ends_at else None,
        "activeSessionPausedAt": active.paused_at.isoformat() if active and active.paused_at else None,
        "remainingSeconds": (
            int((active.ends_at - timezone.now()).total_seconds())
            if active and active.ends_at
            else None
        ),
    }


def product_json(product):
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category,
        "price": money(product.price),
        "isActive": product.is_active,
    }


def order_json(order):
    items = list(order.items.select_related("product"))
    subtotal = sum((item.line_total for item in items), Decimal("0.00"))
    return {
        "id": order.id,
        "items": [
            {
                "productId": item.product_id,
                "productName": item.product.name,
                "quantity": item.quantity,
                "unitPrice": money(item.unit_price),
                "lineTotal": money(item.line_total),
            }
            for item in items
        ],
        "status": order.status,
        "name": order.name,
        "subtotal": money(subtotal),
        "total": money(subtotal),
        "paymentMethod": order.payment_method,
        "sessionId": order.session_id,
        "createdAt": order.created_at.isoformat(),
        "createdBy": order.created_by.username if order.created_by else "System",
        "paidBy": order.paid_by.username if order.paid_by else "System",
    }


@csrf_exempt
def resources(request):
    refresh_overdue()
    if request.method == "GET":
        return JsonResponse(
            [resource_json(resource) for resource in Resource.objects.filter(is_active=True)],
            safe=False,
        )
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    try:
        resource = Resource.objects.create(
            name=str(data["name"]).strip(),
            kind=data["kind"],
            hourly_rate=Decimal(str(data["hourlyRate"])),
        )
    except (KeyError, ValueError, TypeError, ArithmeticError):
        return error("Name, kind, and hourly rate are required")
    if not resource.name or resource.kind not in {"snooker", "billiards", "playstation"} or resource.hourly_rate < 0:
        resource.delete()
        return error("Provide a name, valid resource kind, and non-negative hourly rate")
    audit(request, "Created resource", resource.name)
    return JsonResponse(resource_json(resource), status=201)


@csrf_exempt
def resource_detail(request, resource_id):
    try:
        resource = Resource.objects.get(pk=resource_id)
    except Resource.DoesNotExist:
        return error("Resource not found", 404)
    if request.method == "DELETE":
        if resource.sessions.filter(ended_at__isnull=True).exists():
            return error("Close the active session before removing this resource", 409)
        resource.is_active = False
        resource.save(update_fields=["is_active"])
        audit(request, "Deactivated resource", resource.name)
        return HttpResponse(status=204)
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    data = body(request)
    if "name" in data:
        resource.name = str(data["name"]).strip()
    if "kind" in data:
        resource.kind = data["kind"]
    value = data.get("hourlyRate", resource.hourly_rate)
    try:
        rate = Decimal(str(value))
    except (TypeError, ValueError, ArithmeticError):
        return error("Hourly rate must be a valid number")
    if rate < 0 or not resource.name or resource.kind not in {"snooker", "billiards", "playstation"}:
        return error("Provide a name, valid resource kind, and non-negative hourly rate")
    resource.hourly_rate = rate.quantize(MONEY)
    resource.save(update_fields=["name", "kind", "hourly_rate"])
    audit(request, "Updated resource", resource.name)
    return JsonResponse(resource_json(resource))


@csrf_exempt
def sessions(request):
    refresh_overdue()
    if request.method == "GET":
        status = request.GET.get("status", "active")
        query = PlayingSession.objects.select_related("resource", "created_by", "completed_by").all()
        if status == "active":
            query = query.filter(ended_at__isnull=True)
        elif status == "completed":
            query = query.filter(ended_at__isnull=False)
        date_filter = request.GET.get("date")
        if date_filter:
            query = query.filter(started_at__date=date_filter)
        return JsonResponse([session_json(item) for item in query[:200]], safe=False)

    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    resource_id = data.get("resourceId")
    mode = data.get("mode")
    if mode not in {"open", "limited"}:
        return error("Mode must be open or limited")
    try:
        duration = int(data.get("durationMinutes")) if data.get("durationMinutes") is not None else None
    except (TypeError, ValueError):
        return error("Duration must be a whole number of minutes")
    if mode == "limited" and (duration is None or duration < 1):
        return error("Limited sessions need a duration in minutes")
    try:
        resource = Resource.objects.get(pk=resource_id, is_active=True)
    except Resource.DoesNotExist:
        return error("Resource not found", 404)
    if resource.sessions.filter(ended_at__isnull=True).exists():
        return error("That resource already has an active session")
    now = timezone.now()
    session = PlayingSession.objects.create(
        resource=resource,
        mode=mode,
        ends_at=now + timedelta(minutes=duration) if duration else None,
        duration_minutes=duration,
        created_by=request.user,
    )
    audit(request, "Started session", resource.name)
    return JsonResponse(session_json(session), status=201)


@csrf_exempt
def session_detail(request, session_id):
    refresh_overdue()
    try:
        session = PlayingSession.objects.select_related("resource", "created_by", "completed_by").get(pk=session_id)
    except PlayingSession.DoesNotExist:
        return error("Session not found", 404)
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    data = body(request)
    action = data.get("action")
    if action == "pause":
        if session.ended_at:
            return error("This session is already closed", 409)
        if session.paused_at:
            return error("This session is already paused", 409)
        session.paused_at = timezone.now()
        session.status = "paused"
        session.save(update_fields=["paused_at", "status"])
        audit(request, "Paused session", session.resource.name)
    elif action == "resume":
        if not session.paused_at:
            return error("This session is not paused", 409)
        paused_for = timezone.now() - session.paused_at
        session.started_at += paused_for
        if session.ends_at:
            session.ends_at += paused_for
        session.paused_at = None
        session.status = "active"
        session.save(update_fields=["started_at", "ends_at", "paused_at", "status"])
        audit(request, "Resumed session", session.resource.name)
    elif action == "extend":
        try:
            minutes = int(data.get("durationMinutes"))
        except (TypeError, ValueError):
            return error("Extension must be a whole number of minutes")
        if minutes < 1:
            return error("Extension must be at least one minute")
        now = timezone.now()
        update_fields = ["ends_at", "status"]
        if session.ends_at and session.ends_at <= now:
            # Do not bill the time the table was waiting after its timer ended.
            session.started_at += now - session.ends_at
            update_fields.append("started_at")
        base = session.ends_at if session.ends_at and session.ends_at > now else now
        session.ends_at = base + timedelta(minutes=minutes)
        session.status = "active"
        session.save(update_fields=update_fields)
        audit(request, "Extended session", session.resource.name)
    elif action == "stop":
        payment_method = data.get("paymentMethod")
        if payment_method not in {"cash", "cliq"}:
            return error("Choose cash or CliQ before closing the session")
        with transaction.atomic():
            if session.paused_at:
                paused_for = timezone.now() - session.paused_at
                session.started_at += paused_for
                if session.ends_at:
                    session.ends_at += paused_for
                session.paused_at = None
            session.ended_at = timezone.now()
            session.status = "completed"
            session.payment_status = "paid"
            session.payment_method = payment_method
            session.completed_by = request.user
            session.save(update_fields=["started_at", "ends_at", "paused_at", "ended_at", "status", "payment_status", "payment_method", "completed_by"])
            session.orders.filter(status="open").update(
                status="paid", payment_method=payment_method, paid_by=request.user
            )
            audit(request, "Closed session", session.resource.name)
    else:
        return error("Action must be pause, resume, stop, or extend")
    return JsonResponse(session_json(session))


@csrf_exempt
def session_cafeteria_items(request, session_id):
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    try:
        session = PlayingSession.objects.select_related("resource").get(
            pk=session_id, ended_at__isnull=True
        )
    except PlayingSession.DoesNotExist:
        return error("Open session not found", 404)
    data = body(request)
    try:
        product = Product.objects.get(pk=data["productId"], is_active=True)
        delta = int(data["quantityDelta"])
    except (Product.DoesNotExist, KeyError, TypeError, ValueError):
        return error("Choose an active product and a valid quantity change")
    if delta not in {-1, 1}:
        return error("Quantity change must be one item at a time")
    with transaction.atomic():
        items = OrderItem.objects.select_related("order").filter(
            order__session=session, order__status="open", product=product
        ).order_by("-id")
        item = items.first()
        if delta == 1:
            if item:
                item.quantity += 1
                item.save(update_fields=["quantity"])
            else:
                order = session.orders.filter(status="open").order_by("id").first()
                if not order:
                    order = Order.objects.create(session=session, created_by=request.user)
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=1,
                    unit_price=product.price,
                )
        elif not item:
            return error("That product is not on this session bill")
        elif item.quantity == 1:
            order = item.order
            item.delete()
            if not order.items.exists():
                order.delete()
        else:
            item.quantity -= 1
            item.save(update_fields=["quantity"])
    audit(request, "Updated session cafeteria", session.resource.name)
    return JsonResponse(session_json(session))


@csrf_exempt
def products(request):
    if request.method == "GET":
        return JsonResponse(
            [product_json(item) for item in Product.objects.filter(is_active=True)], safe=False
        )
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    try:
        name = str(data["name"]).strip()
        category = str(data["category"]).strip()
        price = Decimal(str(data["price"])).quantize(MONEY)
        if not name or not category or not price.is_finite() or price < 0:
            raise ValueError
        product = Product.objects.create(
            name=name,
            category=category,
            price=price,
        )
    except (KeyError, ValueError, TypeError, ArithmeticError):
        return error("Name, category, and price are required")
    audit(request, "Created product", product.name)
    return JsonResponse(product_json(product), status=201)


@csrf_exempt
def product_detail(request, product_id):
    try:
        product = Product.objects.get(pk=product_id)
    except Product.DoesNotExist:
        return error("Product not found", 404)
    if request.method == "DELETE":
        product.is_active = False
        product.save(update_fields=["is_active"])
        audit(request, "Deactivated product", product.name)
        return HttpResponse(status=204)
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    data = body(request)
    try:
        product.name = str(data.get("name", product.name)).strip()
        product.category = str(data.get("category", product.category)).strip()
        product.price = Decimal(str(data.get("price", product.price))).quantize(MONEY)
        product.is_active = bool(data.get("isActive", product.is_active))
    except (ValueError, TypeError, ArithmeticError):
        return error("Product details are invalid")
    if not product.name or not product.category or product.price < 0:
        return error("Product name, category, and price are required")
    product.save()
    audit(request, "Updated product", product.name)
    return JsonResponse(product_json(product))


@csrf_exempt
def orders(request):
    if request.method == "GET":
        query = Order.objects.select_related("created_by", "paid_by").prefetch_related("items__product").all()
        status = request.GET.get("status", "all")
        if status in {"open", "paid"}:
            query = query.filter(status=status)
        date_filter = request.GET.get("date")
        if date_filter:
            query = query.filter(created_at__date=date_filter)
        return JsonResponse([order_json(item) for item in query[:200]], safe=False)
    if request.method != "POST":
        return error("Method not allowed", 405)
    data = body(request)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        return error("An order needs at least one item")
    try:
        with transaction.atomic():
            session = None
            session_id = data.get("sessionId")
            if session_id is not None:
                session = PlayingSession.objects.get(pk=session_id, ended_at__isnull=True)
            order = Order.objects.create(
                session=session,
                name=str(data.get("name", "")).strip(),
                created_by=request.user,
            )
            for item in items:
                product = Product.objects.get(pk=item["productId"], is_active=True)
                quantity = int(item["quantity"])
                if quantity < 1:
                    raise ValueError
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    unit_price=product.price,
                )
    except (PlayingSession.DoesNotExist, Product.DoesNotExist, KeyError, ValueError, TypeError):
        return error("Every order item must reference an active product and positive quantity; sessions must be open")
    audit(request, "Created order", order.name or f"Order #{order.id}")
    return JsonResponse(order_json(order), status=201)


@csrf_exempt
def pay_order(request, order_id):
    if request.method != "POST":
        return error("Method not allowed", 405)
    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        return error("Order not found", 404)
    method = body(request).get("paymentMethod")
    if method not in {"cash", "cliq"}:
        return error("Choose cash or CliQ")
    order.status = "paid"
    order.payment_method = method
    order.paid_by = request.user
    order.save(update_fields=["status", "payment_method", "paid_by"])
    audit(request, "Paid order", order.name or f"Order #{order.id}")
    return JsonResponse(order_json(order))


def audit_log(request):
    return JsonResponse(
        [
            {
                "id": entry.id,
                "action": entry.action,
                "subject": entry.subject,
                "username": entry.actor.username if entry.actor else "System",
                "createdAt": entry.created_at.isoformat(),
            }
            for entry in AuditLog.objects.select_related("actor")[:200]
        ],
        safe=False,
    )


@csrf_exempt
def order_items(request, order_id):
    if request.method != "PATCH":
        return error("Method not allowed", 405)
    try:
        order = Order.objects.get(pk=order_id, status="open", session__isnull=True)
    except Order.DoesNotExist:
        return error("Open counter order not found", 404)
    data = body(request)
    try:
        product = Product.objects.get(pk=data["productId"], is_active=True)
        delta = int(data["quantityDelta"])
    except (Product.DoesNotExist, KeyError, TypeError, ValueError):
        return error("Choose an active product and a valid quantity change")
    if delta not in {-1, 1}:
        return error("Quantity change must be one item at a time")
    with transaction.atomic():
        item = OrderItem.objects.filter(order=order, product=product).first()
        if delta == 1:
            if item:
                item.quantity += 1
                item.save(update_fields=["quantity"])
            else:
                OrderItem.objects.create(order=order, product=product, quantity=1, unit_price=product.price)
        elif not item:
            return error("That product is not on this order")
        elif item.quantity == 1:
            item.delete()
        else:
            item.quantity -= 1
            item.save(update_fields=["quantity"])
    audit(request, "Updated order items", order.name or f"Order #{order.id}")
    return JsonResponse(order_json(order))


def paid_sales(from_date, to_date):
    sessions_query = PlayingSession.objects.select_related("resource", "created_by", "completed_by").filter(
        status="completed",
        payment_status="paid",
        ended_at__date__gte=from_date,
        ended_at__date__lte=to_date,
    )
    orders_query = Order.objects.select_related("created_by", "paid_by").prefetch_related("items__product").filter(
        status="paid", created_at__date__gte=from_date, created_at__date__lte=to_date
    )
    return sessions_query, orders_query


def dashboard(request):
    refresh_overdue()
    today = timezone.localdate()
    sessions_query, orders_query = paid_sales(today, today)
    session_revenue = sum((item.total for item in sessions_query), Decimal("0.00"))
    cafeteria_revenue = sum((item.subtotal for item in orders_query), Decimal("0.00"))
    cash = sum(
        (item.total for item in sessions_query if item.payment_method == "cash"), Decimal("0.00")
    ) + sum((item.subtotal for item in orders_query if item.payment_method == "cash"), Decimal("0.00"))
    cliq = sum(
        (item.total for item in sessions_query if item.payment_method == "cliq"), Decimal("0.00")
    ) + sum((item.subtotal for item in orders_query if item.payment_method == "cliq"), Decimal("0.00"))
    recent_sessions = PlayingSession.objects.select_related("resource").filter(
        status="completed", payment_status="paid"
    )[:5]
    recent_orders = Order.objects.prefetch_related("items__product").filter(status="paid")[:5]
    activities = [
        {
            "id": item.id,
            "type": "session",
            "label": item.resource.name,
            "amount": money(item.total),
            "paymentMethod": item.payment_method,
            "createdAt": item.ended_at.isoformat() if item.ended_at else item.started_at.isoformat(),
        }
        for item in recent_sessions
    ] + [
        {
            "id": item.id,
            "type": "cafeteria",
            "label": "Cafeteria order",
            "amount": money(item.subtotal),
            "paymentMethod": item.payment_method,
            "createdAt": item.created_at.isoformat(),
        }
        for item in recent_orders
    ]
    activities.sort(key=lambda item: item["createdAt"], reverse=True)
    return JsonResponse(
        {
            "date": today.isoformat(),
            "resources": [resource_json(resource) for resource in Resource.objects.all()],
            "revenue": money(session_revenue + cafeteria_revenue),
            "activeSessions": PlayingSession.objects.filter(ended_at__isnull=True).count(),
            "openOrders": Order.objects.filter(status="open").count(),
            "paymentMix": {"cash": money(cash), "cliq": money(cliq)},
            "recentActivity": activities[:10],
        }
    )


def profit_report(request):
    try:
        from_date = datetime.strptime(request.GET["from"], "%Y-%m-%d").date()
        to_date = datetime.strptime(request.GET["to"], "%Y-%m-%d").date()
    except (KeyError, ValueError):
        return error("from and to must be dates in YYYY-MM-DD format")
    if from_date > to_date:
        return error("from must be before to")
    sessions_query, orders_query = paid_sales(from_date, to_date)
    session_revenue = sum((item.total for item in sessions_query), Decimal("0.00"))
    cafeteria_revenue = sum((item.subtotal for item in orders_query), Decimal("0.00"))
    payment_totals = {"cash": Decimal("0.00"), "cliq": Decimal("0.00")}
    by_day = defaultdict(
        lambda: {
            "revenue": Decimal("0.00"),
            "cash": Decimal("0.00"),
            "cliq": Decimal("0.00"),
        }
    )
    for item in sessions_query:
        payment_totals[item.payment_method] += item.total
        day = item.ended_at.date().isoformat()
        by_day[day]["revenue"] += item.total
        by_day[day][item.payment_method] += item.total
    for item in orders_query:
        payment_totals[item.payment_method] += item.subtotal
        day = item.created_at.date().isoformat()
        by_day[day]["revenue"] += item.subtotal
        by_day[day][item.payment_method] += item.subtotal
    revenue = session_revenue + cafeteria_revenue
    return JsonResponse(
        {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "revenue": money(revenue),
            "sessionRevenue": money(session_revenue),
            "cafeteriaRevenue": money(cafeteria_revenue),
            "byPaymentMethod": {key: money(value) for key, value in payment_totals.items()},
            "byDay": [
                {
                    "date": day,
                    "revenue": money(values["revenue"]),
                    "cash": money(values["cash"]),
                    "cliq": money(values["cliq"]),
                }
                for day, values in sorted(by_day.items())
            ],
        }
    )
