from rest_framework import serializers
from django.db.models import Sum, F
from django.db.models.functions import Greatest
from decimal import Decimal
from .models import Customer
from .phone import format_pk_phone, validate_pk_phone


class CustomerSerializer(serializers.ModelSerializer):
    outstanding_balance = serializers.SerializerMethodField()
    list_status_updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = [
            'tenant', 'created_at', 'first_name', 'last_name', 'outstanding_balance',
            'list_status_updated_at', 'list_status_updated_by', 'list_status_updated_by_name',
            'created_by', 'updated_at',
        ]
        extra_kwargs = {
            'email': {'required': False, 'allow_blank': True, 'allow_null': True},
            'cnic': {'required': False, 'allow_blank': True},
            'full_name': {'required': True},
        }

    def _sync_legacy_names(self, attrs):
        full_name = (attrs.get('full_name') or '').strip()
        if not full_name and self.instance:
            full_name = (self.instance.full_name or '').strip() or self.instance.display_name
        if not full_name:
            raise serializers.ValidationError({'full_name': 'Full name is required.'})
        attrs['full_name'] = full_name
        attrs['first_name'] = full_name
        attrs['last_name'] = ''
        email = attrs.get('email')
        if email is not None and str(email).strip() == '':
            attrs['email'] = None
        return attrs

    def _is_guest_house_request(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return getattr(user, 'app_type', '') == 'GUEST_HOUSE'

    def validate(self, attrs):
        attrs = self._sync_legacy_names(attrs)
        if 'list_status_note' in attrs:
            attrs['list_status_note'] = (attrs.get('list_status_note') or '').strip()

        is_minor = bool(attrs.get('is_minor', self.instance.is_minor if self.instance else False))
        attrs['is_minor'] = is_minor

        linked_primary = attrs.get('linked_primary')
        if linked_primary is None and self.instance:
            linked_primary = self.instance.linked_primary
        if is_minor and linked_primary and 'linked_primary' not in attrs:
            attrs['linked_primary'] = linked_primary

        phone = (attrs.get('phone') if 'phone' in attrs else (self.instance.phone if self.instance else '')) or ''
        phone = str(phone).strip()
        if is_minor:
            if not phone and linked_primary:
                phone = (linked_primary.phone or '').strip()
            if not phone:
                phone = '—'
            attrs['phone'] = phone
        elif not phone:
            raise serializers.ValidationError({'phone': 'Phone number is required.'})
        else:
            phone_error = validate_pk_phone(phone)
            if phone_error:
                raise serializers.ValidationError({'phone': phone_error})
            attrs['phone'] = format_pk_phone(phone)

        cnic = (attrs.get('cnic') if 'cnic' in attrs else (self.instance.cnic if self.instance else '')) or ''
        cnic = str(cnic).strip()

        if 'address' in attrs and attrs['address'] is not None:
            attrs['address'] = str(attrs['address']).strip() or None

        gender = (attrs.get('gender') if 'gender' in attrs else (self.instance.gender if self.instance else '')) or ''
        gender = str(gender).strip().upper()
        if gender and gender not in ('MALE', 'FEMALE'):
            raise serializers.ValidationError({'gender': 'Select Male or Female.'})
        if 'gender' in attrs:
            attrs['gender'] = gender

        relative_relation = (
            attrs.get('relative_relation')
            if 'relative_relation' in attrs
            else (self.instance.relative_relation if self.instance else '')
        ) or ''
        relative_relation = str(relative_relation).strip().upper()
        relative_name = (
            attrs.get('relative_name')
            if 'relative_name' in attrs
            else (self.instance.relative_name if self.instance else '')
        ) or ''
        relative_name = str(relative_name).strip()

        if is_minor:
            # Under-3 / child profiles: father name + father CNIC (no own ID required).
            attrs['gender'] = ''
            attrs['relative_relation'] = 'FATHER'
            if 'relative_name' in attrs or not relative_name:
                attrs['relative_name'] = relative_name
            if not (attrs.get('relative_name') or (self.instance.relative_name if self.instance else '')):
                # Fallback: use full_name as father name for legacy child creates
                if attrs.get('full_name'):
                    attrs['relative_name'] = attrs['full_name']
                else:
                    raise serializers.ValidationError({'relative_name': 'Father name is required.'})
            if not cnic:
                raise serializers.ValidationError({'cnic': 'Father CNIC / ID is required.'})
            attrs['cnic'] = cnic
            if not attrs.get('full_name'):
                attrs['full_name'] = f"Child of {attrs['relative_name']}"
                attrs['first_name'] = attrs['full_name']
                attrs['last_name'] = ''
            # Address optional for under-3 children
        else:
            if self._is_guest_house_request() and not cnic:
                raise serializers.ValidationError({'cnic': 'CNIC is required.'})
            attrs['cnic'] = cnic

            if gender == 'MALE':
                relative_relation = 'FATHER'
            elif gender == 'FEMALE' and relative_relation not in ('FATHER', 'HUSBAND', 'SON', 'OTHER', ''):
                raise serializers.ValidationError({'relative_relation': 'Select relation type.'})

            if 'relative_relation' in attrs or gender:
                attrs['relative_relation'] = relative_relation if gender else ''
            if 'relative_name' in attrs or gender:
                attrs['relative_name'] = relative_name if gender else ''

            if self._is_guest_house_request() and gender:
                if not relative_name:
                    label = {
                        'FATHER': 'Father name',
                        'HUSBAND': 'Husband name',
                        'SON': 'Son name',
                        'OTHER': 'Relative name',
                    }.get(relative_relation or 'FATHER', 'Relative name')
                    raise serializers.ValidationError({'relative_name': f'{label} is required.'})
                if gender == 'FEMALE' and relative_relation not in ('FATHER', 'HUSBAND', 'SON', 'OTHER'):
                    raise serializers.ValidationError({'relative_relation': 'Select Husband, Father, Son, or Other.'})

        return attrs

    def get_outstanding_balance(self, obj):
        hall_due = obj.bookings.exclude(booking_status='CANCELLED').aggregate(
            total=Sum('remaining_balance')
        )['total'] or Decimal('0')
        gh_total = obj.gh_stays.exclude(status='CANCELLED').annotate(
            due=Greatest(F('total_amount') - F('advance_paid'), Decimal('0'))
        ).aggregate(total=Sum('due'))['total'] or Decimal('0')
        return float(max(Decimal('0'), hall_due) + max(Decimal('0'), gh_total))

    def get_list_status_updated_by_name(self, obj):
        if not obj.list_status_updated_by_id:
            return ''
        user = obj.list_status_updated_by
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request.user, 'tenant') and request.user.tenant:
            validated_data['tenant'] = request.user.tenant
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)
