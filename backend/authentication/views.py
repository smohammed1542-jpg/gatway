from rest_framework import generics, status, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from core.permissions import IsAdminOrManagerWriteStaffRead, IsAdminOnly
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    StaffSerializer,
    ChangePasswordSerializer,
    StaffResetPasswordSerializer,
    CustomTokenObtainPairSerializer,
)
from .models import StaffProfile, User


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = 'login'


class PortalHintView(APIView):
    """Public hint for login UI — which app (hall vs guest house) a username belongs to."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        username = (request.query_params.get('username') or '').strip()
        if not username:
            return Response({'app_type': None})

        user = User.objects.filter(**{f'{User.USERNAME_FIELD}__iexact': username}).first()
        if not user:
            return Response({'app_type': None})

        return Response({'app_type': getattr(user, 'app_type', 'MARRIAGE_HALL')})


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer
    throttle_scope = 'register'

    def create(self, request, *args, **kwargs):
        from django.conf import settings as dj_settings
        if not getattr(dj_settings, 'ALLOW_PUBLIC_REGISTRATION', False):
            return Response(
                {'detail': 'Public registration is disabled. Ask an administrator to create your account.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)


class UserDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user

    def patch(self, request, *args, **kwargs):
        user = self.get_object()
        if 'profile_picture' in request.FILES:
            user.profile_picture = request.FILES['profile_picture']
            user.save(update_fields=['profile_picture'])
        return super().patch(request, *args, **kwargs)


class ChangePasswordView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {'detail': 'Password updated successfully.'},
            status=status.HTTP_200_OK,
        )


class StaffViewSet(viewsets.ModelViewSet):
    serializer_class = StaffSerializer
    permission_classes = [IsAdminOrManagerWriteStaffRead]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser and not user.tenant_id:
            return User.objects.all().order_by('-date_joined')
        if not user.tenant_id:
            return User.objects.none()
        qs = User.objects.filter(tenant=user.tenant)
        app_type = getattr(user, 'app_type', None)
        if app_type and not user.is_superuser:
            qs = qs.filter(app_type=app_type)
        return qs.order_by('-date_joined')

    @action(detail=True, methods=['post'], url_path='reset-password', permission_classes=[IsAdminOnly])
    def reset_password(self, request, pk=None):
        staff_user = self.get_object()
        if staff_user.tenant_id != request.user.tenant_id and not request.user.is_superuser:
            return Response({'detail': 'Not allowed.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = StaffResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff_user.set_password(serializer.validated_data['new_password'])
        staff_user.save(update_fields=['password'])
        return Response({'detail': 'Password reset successfully.'})
