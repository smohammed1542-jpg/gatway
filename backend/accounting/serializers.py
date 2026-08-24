from rest_framework import serializers

from .models import Account, FiscalPeriod, JournalEntry, JournalLine, Tax, AuditLog


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'account_type', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ['id', 'name', 'rate', 'is_default', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = ['id', 'name', 'start_date', 'end_date', 'is_closed', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = JournalLine
        fields = ['id', 'account', 'account_code', 'account_name', 'description', 'debit', 'credit']


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = [
            'id', 'entry_no', 'entry_date', 'memo', 'source_type', 'source_id',
            'status', 'reversed_entry', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'lines',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return ''
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username or ''


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'action', 'entity_type', 'entity_id', 'message',
            'actor', 'actor_name', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        user = obj.actor
        if not user:
            return ''
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username or ''
