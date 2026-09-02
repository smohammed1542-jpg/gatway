from rest_framework import permissions

MARRIAGE_HALL_APP = 'MARRIAGE_HALL'
GUEST_HOUSE_APP = 'GUEST_HOUSE'


def _user_app_type(user):
    return getattr(user, 'app_type', MARRIAGE_HALL_APP) or MARRIAGE_HALL_APP


class IsMarriageHallApp(permissions.BasePermission):
    """Only Marriage Hall users (superuser bypasses)."""

    message = 'This account is for Guest House. Use the Guest House login.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return _user_app_type(request.user) == MARRIAGE_HALL_APP


class IsGuestHouseApp(permissions.BasePermission):
    """Only Guest House users (superuser bypasses)."""

    message = 'This account is for Marriage Hall. Use the Marriage Hall login.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return _user_app_type(request.user) == GUEST_HOUSE_APP


class IsTenantOwner(permissions.BasePermission):
    """Object must belong to the user's tenant."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser and not request.user.tenant_id:
            return True
        tenant = getattr(obj, 'tenant', None)
        if tenant is None:
            booking = getattr(obj, 'booking', None)
            if booking is not None:
                tenant = getattr(booking, 'tenant', None)
        if tenant is None:
            return False
        obj_tenant_id = tenant.id if hasattr(tenant, 'id') else tenant
        return obj_tenant_id == request.user.tenant_id


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_superuser or getattr(request.user, 'role', None) == 'ADMIN'
        )


class IsAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return getattr(request.user, 'role', None) in ('ADMIN', 'MANAGER')


class IsAdminOrManagerOrReadOnly(permissions.BasePermission):
    """ADMIN/MANAGER: full access. STAFF: GET/HEAD/OPTIONS only."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.method in permissions.SAFE_METHODS:
            return getattr(request.user, 'role', None) in ('ADMIN', 'MANAGER', 'STAFF')
        return getattr(request.user, 'role', None) in ('ADMIN', 'MANAGER')


class IsAdminOrManagerOrStaffWrite(permissions.BasePermission):
    """ADMIN/MANAGER: full. STAFF: read + create/update (e.g. record payments)."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        role = getattr(request.user, 'role', None)
        if request.method in permissions.SAFE_METHODS:
            return role in ('ADMIN', 'MANAGER', 'STAFF')
        return role in ('ADMIN', 'MANAGER', 'STAFF')


class IsAdminOnly(permissions.BasePermission):
    """Only ADMIN (and superuser) may access."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_superuser or getattr(request.user, 'role', None) == 'ADMIN'
        )


class IsAdminOrManagerWriteStaffRead(permissions.BasePermission):
    """Staff management: ADMIN writes; MANAGER read-only; STAFF denied."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        role = getattr(request.user, 'role', None)
        if request.method in permissions.SAFE_METHODS:
            return role in ('ADMIN', 'MANAGER')
        return role == 'ADMIN'


class IsAdminOrManagerNoStaff(permissions.BasePermission):
    """Expenses etc.: ADMIN/MANAGER only; STAFF denied."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return getattr(request.user, 'role', None) in ('ADMIN', 'MANAGER')


class IsGhStaffOrAbove(permissions.BasePermission):
    """Guest House front-desk actions: ADMIN, MANAGER, and STAFF."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return getattr(request.user, 'role', None) in ('ADMIN', 'MANAGER', 'STAFF')


class IsCustomerWritable(permissions.BasePermission):
    """Customers: ADMIN/MANAGER full; STAFF read-only on Marriage Hall, create/update on Guest House."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        role = getattr(request.user, 'role', None)
        if request.method in permissions.SAFE_METHODS:
            return role in ('ADMIN', 'MANAGER', 'STAFF')
        if request.method == 'DELETE':
            return role in ('ADMIN', 'MANAGER')
        if role in ('ADMIN', 'MANAGER'):
            return True
        return role == 'STAFF' and _user_app_type(request.user) in (GUEST_HOUSE_APP, MARRIAGE_HALL_APP)
