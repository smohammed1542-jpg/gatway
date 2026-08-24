import re
from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from core.models import Tenant, UserSettings
from .models import StaffProfile

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login with role/app checks - staff accounts created via Staff management."""

    def validate(self, attrs):
        username = (attrs.get(self.username_field) or '').strip()
        password = attrs.get('password') or ''

        if not username:
            raise serializers.ValidationError({
                self.username_field: 'Username is required.',
            })

        try:
            user = User.objects.get(**{f'{self.username_field}__iexact': username})
        except User.DoesNotExist:
            raise serializers.ValidationError({
                self.username_field: 'Username is incorrect.',
            })

        if not user.check_password(password):
            raise serializers.ValidationError({
                'password': 'Password is incorrect.',
            })

        if not user.is_active:
            raise serializers.ValidationError({
                'detail': 'This account is inactive. Contact your administrator.',
            })
        profile = getattr(user, 'profile', None)
        if profile is not None and not profile.status:
            raise serializers.ValidationError({
                'detail': 'This account has been deactivated. Contact your administrator.',
            })

        self.user = user
        refresh = self.get_token(user)
        data = {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }
        data['role'] = user.role
        data['app_type'] = getattr(user, 'app_type', 'MARRIAGE_HALL')
        data['first_name'] = user.first_name
        data['last_name'] = user.last_name
        return data


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'subdomain', 'plan_type', 'phone', 'address', 'tax_rate', 'overtime_rate_per_hour', 'default_currency']


class UserSerializer(serializers.ModelSerializer):
    tenant = TenantSerializer(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'role', 'app_type', 'tenant',
            'first_name', 'last_name', 'date_joined', 'last_login', 'is_active', 'avatar',
        ]
        read_only_fields = [
            'id', 'username', 'email', 'role', 'app_type', 'tenant',
            'date_joined', 'last_login', 'is_active', 'avatar',
        ]

    def get_avatar(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'New password and confirmation do not match.',
            })
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError({
                'new_password': 'New password must be different from your current password.',
            })
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class StaffResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)


class StaffSerializer(serializers.ModelSerializer):
    tenant_name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    joining_date = serializers.DateField(required=False, allow_null=True)
    profile_status = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'app_type',
            'tenant_name', 'avatar', 'date_joined', 'last_login', 'is_active',
            'phone', 'salary', 'joining_date', 'profile_status',
        ]
        read_only_fields = ['id', 'app_type', 'tenant_name', 'avatar', 'date_joined', 'last_login', 'is_active']

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None

    def get_avatar(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None

    def _profile_data(self, validated_data):
        return {
            'phone': validated_data.pop('phone', None),
            'salary': validated_data.pop('salary', 0),
            'joining_date': validated_data.pop('joining_date', None),
            'status': validated_data.pop('profile_status', True),
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        profile = getattr(instance, 'profile', None)
        if profile:
            data['phone'] = profile.phone or ''
            data['salary'] = profile.salary
            data['joining_date'] = profile.joining_date
            data['profile_status'] = profile.status
        else:
            data.setdefault('phone', '')
            data.setdefault('salary', 0)
            data.setdefault('joining_date', None)
            data.setdefault('profile_status', True)
        return data

    def validate(self, attrs):
        if self.instance is None:
            password = (attrs.get('password') or '').strip()
            if not password:
                raise serializers.ValidationError({
                    'password': 'Password is required so the staff member can log in.',
                })
            if len(password) < 8:
                raise serializers.ValidationError({
                    'password': 'Password must be at least 8 characters.',
                })
        return attrs

    def validate_username(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Username is required.')
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def _sync_login_access(self, user, profile_active):
        """Keep Django login flag aligned with staff profile access toggle."""
        active = bool(profile_active)
        if user.is_active != active:
            user.is_active = active
            user.save(update_fields=['is_active'])

    def update(self, instance, validated_data):
        profile_fields = self._profile_data(validated_data)
        for field in ('first_name', 'last_name', 'role'):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        if instance.tenant_id:
            profile, _ = StaffProfile.objects.get_or_create(
                user=instance,
                defaults={'tenant': instance.tenant},
            )
            if profile.tenant_id is None:
                profile.tenant = instance.tenant
            for key, val in profile_fields.items():
                if val is not None or key == 'phone':
                    setattr(profile, key, val if val is not None else profile_fields.get(key))
            profile.save()
            if 'status' in profile_fields:
                self._sync_login_access(instance, profile_fields['status'])
        return instance

    def create(self, validated_data):
        request = self.context.get('request')
        profile_fields = self._profile_data(validated_data)
        password = validated_data.pop('password')
        role = validated_data.get('role', 'STAFF')
        if role not in ('ADMIN', 'MANAGER', 'STAFF'):
            validated_data['role'] = 'STAFF'
        profile_active = profile_fields.get('status', True)
        user = User(**validated_data)
        user.is_active = bool(profile_active)
        if request and getattr(request.user, 'tenant_id', None):
            user.tenant = request.user.tenant
            user.app_type = getattr(request.user, 'app_type', 'MARRIAGE_HALL')
        user.set_password(password)
        user.save()
        if user.tenant_id:
            StaffProfile.objects.create(
                user=user,
                tenant=user.tenant,
                phone=profile_fields.get('phone') or '',
                salary=profile_fields.get('salary') or 0,
                joining_date=profile_fields.get('joining_date'),
                status=bool(profile_active),
            )
        return user


class RegisterSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(write_only=True)
    subdomain = serializers.CharField(write_only=True, required=False, allow_blank=True)
    username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'tenant_name', 'subdomain']

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        attrs['email'] = email
        username = (attrs.get('username') or '').strip() or email.split('@')[0]
        username = re.sub(r'[^a-zA-Z0-9._-]', '', username)[:150] or 'admin'
        base_username = username
        n = 1
        while User.objects.filter(username__iexact=username).exists():
            username = f'{base_username}{n}'
            n += 1
        attrs['username'] = username

        subdomain = (attrs.get('subdomain') or '').strip().lower()
        if not subdomain:
            subdomain = re.sub(r'[^a-z0-9]+', '-', attrs['tenant_name'].lower()).strip('-')[:80] or 'hall'
        attrs['subdomain'] = subdomain
        if Tenant.objects.filter(subdomain=subdomain).exists():
            attrs['subdomain'] = f'{subdomain}-{User.objects.count() + 1}'
        return attrs

    def create(self, validated_data):
        tenant_name = validated_data.pop('tenant_name')
        subdomain = validated_data.pop('subdomain')
        username = validated_data.pop('username', None)
        password = validated_data.pop('password')

        tenant = Tenant.objects.create(name=tenant_name, subdomain=subdomain)

        user = User.objects.create_user(
            username=username or validated_data['email'].split('@')[0],
            email=validated_data['email'],
            password=password,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            tenant=tenant,
            role='ADMIN',
            app_type='MARRIAGE_HALL',
        )
        UserSettings.objects.create(user=user)
        return user
